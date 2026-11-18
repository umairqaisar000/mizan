import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readJsonFileOrFallback, writeJsonFile } from './json-files.mjs';
import { estimateCostUsd } from './pricing.mjs';

const REMEMBERED_MESSAGE_IDS = 3000;

export const EMPTY_TOKENS = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWriteShort: 0, cacheWriteLong: 0 });

export function transcriptFiles(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath.endsWith('.jsonl') || !existsSync(transcriptPath)) return [];
  const subagentDirectory = join(dirname(transcriptPath), basename(transcriptPath, '.jsonl'), 'subagents');
  const subagentFiles = existsSync(subagentDirectory)
    ? readdirSync(subagentDirectory).filter((name) => name.endsWith('.jsonl')).map((name) => join(subagentDirectory, name))
    : [];
  return [transcriptPath, ...subagentFiles];
}

export function readNewUsage(cursorPath, transcriptPath) {
  const cursor = readJsonFileOrFallback(cursorPath, { offsets: {}, seenMessageIds: [] });
  const seen = new Set(cursor.seenMessageIds);
  const byModel = {};
  const offsets = { ...cursor.offsets };
  for (const file of transcriptFiles(transcriptPath)) {
    const { text, nextOffset } = readCompleteLinesFrom(file, offsets[file] ?? 0);
    offsets[file] = nextOffset;
    for (const line of text.split('\n')) {
      const message = parseAssistantMessage(line);
      if (!message || seen.has(message.id)) continue;
      seen.add(message.id);
      byModel[message.model] = addTokens(byModel[message.model] ?? EMPTY_TOKENS, tokensFrom(message.usage));
    }
  }
  writeJsonFile(cursorPath, { offsets, seenMessageIds: [...seen].slice(-REMEMBERED_MESSAGE_IDS) });
  return byModel;
}

export function mergeUsage(existing, byModel) {
  const merged = { ...(existing?.byModel ?? {}) };
  for (const [model, tokens] of Object.entries(byModel)) merged[model] = addTokens(merged[model] ?? EMPTY_TOKENS, tokens);
  return summarizeUsage(merged);
}

export function summarizeUsage(byModel) {
  const totals = Object.values(byModel).reduce((sum, tokens) => addTokens(sum, tokens), EMPTY_TOKENS);
  const costs = Object.entries(byModel).map(([model, tokens]) => [model, estimateCostUsd(model, tokens)]);
  const unpricedModels = costs.filter(([, cost]) => cost === null).map(([model]) => model);
  const estimatedCostUsd = costs.reduce((sum, [, cost]) => sum + (cost ?? 0), 0);
  return { byModel, totalTokens: totalTokenCount(totals), totals, estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)), unpricedModels };
}

export function hasUsage(byModel) {
  return Object.values(byModel).some((tokens) => totalTokenCount(tokens) > 0);
}

export function describeUsage(usage) {
  if (!usage || usage.totalTokens === 0) return 'no token usage recorded yet';
  const unpriced = usage.unpricedModels.length > 0 ? ` (no price known for ${usage.unpricedModels.join(', ')})` : '';
  return `${formatTokenCount(usage.totalTokens)} tokens, about $${usage.estimatedCostUsd.toFixed(2)} at API list prices${unpriced}`;
}

export function formatTokenCount(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return String(count);
}

function totalTokenCount(tokens) {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWriteShort + tokens.cacheWriteLong;
}

function addTokens(left, right) {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWriteShort: left.cacheWriteShort + right.cacheWriteShort,
    cacheWriteLong: left.cacheWriteLong + right.cacheWriteLong,
  };
}

function tokensFrom(usage) {
  const cacheWriteTotal = usage.cache_creation_input_tokens ?? 0;
  const cacheWriteLong = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWriteShort: Math.max(0, cacheWriteTotal - cacheWriteLong),
    cacheWriteLong,
  };
}

function parseAssistantMessage(line) {
  if (!line.includes('"usage"')) return null;
  try {
    const message = JSON.parse(line).message;
    if (!message?.id || !message.usage || typeof message.model !== 'string') return null;
    return message;
  } catch {
    return null;
  }
}

function readCompleteLinesFrom(file, offset) {
  const descriptor = openSync(file, 'r');
  try {
    const { size } = fstatSync(descriptor);
    const start = offset > size ? 0 : offset;
    const buffer = Buffer.alloc(size - start);
    readSync(descriptor, buffer, 0, buffer.length, start);
    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline === -1) return { text: '', nextOffset: start };
    return { text: buffer.subarray(0, lastNewline).toString('utf8'), nextOffset: start + lastNewline + 1 };
  } finally {
    closeSync(descriptor);
  }
}
