import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs';
import { dirname } from 'node:path';
import { isoDate, isoTimestamp } from './dates.mjs';
import { currentBranch, currentCommit } from './git.mjs';
import { resolveAuthor } from './identity.mjs';

const TAIL_READ_BYTES = 64 * 1024;

export const LOG_ENTRY_TYPES = [
  'setup',
  'task-started',
  'phase-changed',
  'task-blocked',
  'task-unblocked',
  'task-closed',
  'task-abandoned',
  'ad-hoc-edit',
  'decision',
  'decision-reviewed',
  'rule-added',
  'note',
];

export function appendLogEntry(paths, config, { type, summary, taskId = null, ticket = null, files = [], details = null }) {
  if (!LOG_ENTRY_TYPES.includes(type)) {
    throw new Error(`Unknown log entry type "${type}". Use one of: ${LOG_ENTRY_TYPES.join(', ')}.`);
  }
  const author = resolveAuthor(paths.projectRoot);
  const now = new Date();
  const entry = {
    at: isoTimestamp(now),
    date: isoDate(now),
    author: author.name,
    ...(config.log.includeEmail && author.email ? { email: author.email } : {}),
    tool: 'claude-code',
    type,
    summary,
    taskId,
    ticket,
    branch: currentBranch(paths.projectRoot),
    commit: currentCommit(paths.projectRoot),
    files,
    ...(details ? { details } : {}),
  };
  mkdirSync(dirname(paths.log), { recursive: true });
  appendFileSync(paths.log, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function readRecentLogEntries(paths, maximumEntries) {
  if (!existsSync(paths.log)) {
    return [];
  }
  const tailText = readFileTail(paths.log, TAIL_READ_BYTES);
  const lines = tailText.split('\n').filter((line) => line.trim().startsWith('{'));
  return lines.slice(-maximumEntries).flatMap(parseLogLine);
}

export function readAllLogEntries(paths) {
  if (!existsSync(paths.log)) {
    return [];
  }
  const fileDescriptor = openSync(paths.log, 'r');
  try {
    const { size } = fstatSync(fileDescriptor);
    const buffer = Buffer.alloc(size);
    readSync(fileDescriptor, buffer, 0, size, 0);
    return buffer.toString('utf8').split('\n').filter(Boolean).flatMap(parseLogLine);
  } finally {
    closeSync(fileDescriptor);
  }
}

function parseLogLine(line) {
  try {
    return [JSON.parse(line)];
  } catch {
    return [];
  }
}

function readFileTail(filePath, byteCount) {
  const fileDescriptor = openSync(filePath, 'r');
  try {
    const { size } = fstatSync(fileDescriptor);
    const start = Math.max(0, size - byteCount);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    readSync(fileDescriptor, buffer, 0, length, start);
    return buffer.toString('utf8');
  } finally {
    closeSync(fileDescriptor);
  }
}

export function formatLogEntryLine(entry) {
  const taskLabel = entry.taskId ? ` [${entry.taskId}]` : '';
  return `${entry.date} ${entry.author}: ${entry.summary}${taskLabel}`;
}
