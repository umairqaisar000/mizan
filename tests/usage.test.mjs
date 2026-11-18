import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { estimateCostUsd } from '../scripts/lib/pricing.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let projectRoot;
let environment;
let transcriptPath;

function runCli(...args) {
  const result = spawnSync('node', [join(pluginRoot, 'scripts', 'mizan.mjs'), ...args], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function runHook(name) {
  return spawnSync('node', [join(pluginRoot, 'scripts', 'hooks', `${name}.mjs`)], { cwd: projectRoot, env: environment, input: JSON.stringify({ cwd: projectRoot, transcript_path: transcriptPath }), encoding: 'utf8' });
}

function assistantLine(id, model, usage) {
  return `${JSON.stringify({ type: 'assistant', message: { id, model, role: 'assistant', usage } })}\n`;
}

function taskState(taskId) {
  return JSON.parse(readFileSync(join(projectRoot, '.mizan/tasks', taskId, 'state.json'), 'utf8'));
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-usage-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot };
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Cost Person'], { cwd: projectRoot });
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'usage', type: 'module', scripts: { test: 'node --test' } }));
  runCli('init');
  transcriptPath = join(projectRoot, 'session-1.jsonl');
  mkdirSync(join(projectRoot, 'session-1', 'subagents'), { recursive: true });
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('prices follow the model and the kind of token', () => {
  const cost = estimateCostUsd('claude-opus-5-5', { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWriteShort: 1_000_000, cacheWriteLong: 1_000_000 });
  assert.equal(Number(cost.toFixed(2)), 4 + 20 + 0.2 + 5 + 8);
  assert.equal(estimateCostUsd('some-other-model', { input: 1, output: 1, cacheRead: 0, cacheWriteShort: 0, cacheWriteLong: 0 }), null);
});

test('usage is counted once per message, includes subagents, and lands on the task with its cost logged at the end', () => {
  runCli('task', 'start', 'costed', '--title', 'Costed work');
  const taskId = JSON.parse(readFileSync(join(projectRoot, '.mizan/.local/active.json'), 'utf8')).taskId;
  const mainUsage = { input_tokens: 10, output_tokens: 1000, cache_read_input_tokens: 100000, cache_creation_input_tokens: 2000, cache_creation: { ephemeral_1h_input_tokens: 2000, ephemeral_5m_input_tokens: 0 } };
  writeFileSync(transcriptPath, assistantLine('msg_1', 'claude-opus-5-5', mainUsage) + assistantLine('msg_1', 'claude-opus-5-5', mainUsage) + '{"type":"user"}\n');
  writeFileSync(join(projectRoot, 'session-1', 'subagents', 'agent-a.jsonl'), assistantLine('msg_2', 'claude-sonnet-5-5', { input_tokens: 5, output_tokens: 500, cache_read_input_tokens: 50000, cache_creation_input_tokens: 1000 }));

  runHook('stop');
  const first = taskState(taskId).usage;
  assert.equal(first.totalTokens, 10 + 1000 + 100000 + 2000 + 5 + 500 + 50000 + 1000);
  assert.ok(Math.abs(first.estimatedCostUsd - 0.06855) < 0.0002, String(first.estimatedCostUsd));
  runHook('stop');
  assert.equal(taskState(taskId).usage.totalTokens, first.totalTokens);
  assert.match(runCli('status').output, /Cost so far: 155K tokens, about \$0\.07 at API list prices/);

  appendFileSync(transcriptPath, assistantLine('msg_3', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }));
  runCli('task', 'abandon', 'testing cost');
  runHook('stop');
  const log = readFileSync(join(projectRoot, '.mizan/log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const cost = log.find((entry) => entry.type === 'task-cost');
  assert.equal(cost.author, 'Cost Person');
  assert.equal(cost.taskId, taskId);
  assert.ok(Math.abs(cost.details.estimatedCostUsd - 0.10855) < 0.0002);
  assert.match(cost.summary, /Cost of "Costed work": 157K tokens, about \$0\.11/);
  assert.match(runCli('digest').output, /Cost Person in total: 1 task\(s\), 157K tokens, about \$0\.11/);
});

test('usage tracking can be switched off and never blocks the turn', () => {
  const brokenTranscript = runHook('stop');
  assert.equal(brokenTranscript.status, 0);
  const configPath = join(projectRoot, '.mizan/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify({ ...config, log: { ...config.log, trackUsage: false } }));
  runCli('task', 'start', 'untracked', '--title', 'Untracked');
  appendFileSync(transcriptPath, assistantLine('msg_4', 'claude-opus-5-5', { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }));
  runHook('stop');
  const taskId = JSON.parse(readFileSync(join(projectRoot, '.mizan/.local/active.json'), 'utf8')).taskId;
  assert.equal(taskState(taskId).usage, undefined);
  assert.doesNotMatch(runCli('status').output, /Cost so far/);
});
