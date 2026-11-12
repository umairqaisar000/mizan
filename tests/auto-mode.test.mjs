import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyBashCommand } from '../scripts/lib/bash-rules.mjs';
import { DEFAULT_CONFIG } from '../scripts/lib/config.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let projectRoot;
let environment;

function runCli(...args) {
  const result = spawnSync('node', [join(pluginRoot, 'scripts', 'mizan.mjs'), ...args], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function runHook(name, payload) {
  return spawnSync('node', [join(pluginRoot, 'scripts', 'hooks', `${name}.mjs`)], {
    cwd: projectRoot,
    env: environment,
    input: JSON.stringify({ cwd: projectRoot, ...payload }),
    encoding: 'utf8',
  });
}

function currentBranch() {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function activeTask() {
  const { taskId } = JSON.parse(readFileSync(join(projectRoot, '.mizan/.local/active.json'), 'utf8'));
  return JSON.parse(readFileSync(join(projectRoot, '.mizan/tasks', taskId, 'state.json'), 'utf8'));
}

function autoDecision(question, category) {
  return runCli('decision', question, '--kind', 'auto', '--category', category, '--chosen', 'Round half up', '--options', 'Round half up | Banker rounding', '--reason', 'Matches how invoices are rounded elsewhere');
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-auto-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot };
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Auto Person'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.email', 'auto@example.com'], { cwd: projectRoot });
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'auto', type: 'module', scripts: { test: 'node --test' } }));
  execFileSync('git', ['add', '-A'], { cwd: projectRoot });
  execFileSync('git', ['commit', '-q', '-m', 'start'], { cwd: projectRoot });
  runCli('init');
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('guided is the default and auto decisions are refused in guided tasks', () => {
  assert.equal(runCli('task', 'start', 'guided-one', '--title', 'Guided').exitCode, 0);
  assert.equal(activeTask().mode, 'guided');
  assert.equal(currentBranch(), 'main');
  const refused = autoDecision('How should cents be rounded?', 'money');
  assert.equal(refused.exitCode, 1);
  assert.match(refused.output, /only allowed in an active auto-mode task/);
  runCli('task', 'clear');
});

test('an auto task works on its own branch and records decisions for review', () => {
  const started = runCli('task', 'start', 'auto-one', '--title', 'Auto rounding', '--auto');
  assert.equal(started.exitCode, 0, started.output);
  assert.match(started.output, /auto mode/);
  assert.equal(activeTask().mode, 'auto');
  assert.match(currentBranch(), /^mizan\/\d{4}-\d{2}-\d{2}-auto-one$/);

  const recorded = autoDecision('How should cents be rounded?', 'money');
  assert.equal(recorded.exitCode, 0, recorded.output);
  const decisionId = /D-[0-9a-f]{6}/.exec(recorded.output)[0];
  assert.match(readFileSync(join(projectRoot, '.mizan/decisions.md'), 'utf8'), new RegExp(`Auto-decided \\(${decisionId}, needs review\\)`));

  const pending = runCli('decisions');
  assert.match(pending.output, new RegExp(`\\[${decisionId}\\].*Round half up \\(money\\)`));

  const security = autoDecision('Who can see claim details?', 'security');
  assert.equal(security.exitCode, 1);
  assert.match(security.output, /always need a human/);

  assert.equal(runCli('decisions', 'accept', decisionId, 'fine').exitCode, 0);
  assert.match(runCli('decisions').output, /No auto decisions are waiting/);
});

test('auto mode keeps going instead of stopping, unless the task is blocked', () => {
  const stop = runHook('stop', {});
  assert.equal(stop.status, 2);
  assert.match(stop.stderr, /Auto mode: .* Keep going/);
  runCli('task', 'block', 'Need the user to confirm the database change');
  assert.equal(runHook('stop', {}).status, 0);
  runCli('task', 'unblock');
});

test('auto mode stops for schema changes and Claude cannot review its own decisions', () => {
  const migration = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'db/migrations/001_add_column.sql'), content: 'ALTER TABLE claims ADD COLUMN reason TEXT;\n' } });
  assert.equal(JSON.parse(migration.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const options = { deployCommandPatterns: DEFAULT_CONFIG.approvals.deployCommandPatterns, lockedTestPatterns: [] };
  assert.equal(classifyBashCommand('.mizan/.local/mizan decisions accept D-abc123', options).decision, 'ask');
  assert.equal(classifyBashCommand('.mizan/.local/mizan decisions', options).decision, 'allow');
});

test('the project default mode comes from the config and an unknown mode is rejected', () => {
  runCli('task', 'clear');
  const config = JSON.parse(readFileSync(join(projectRoot, '.mizan/config.json'), 'utf8'));
  writeFileSync(join(projectRoot, '.mizan/config.json'), JSON.stringify({ ...config, mode: 'auto' }));
  execFileSync('git', ['switch', '-q', 'main'], { cwd: projectRoot });
  assert.equal(runCli('task', 'start', 'from-default', '--title', 'Default auto').exitCode, 0);
  assert.equal(activeTask().mode, 'auto');
  runCli('task', 'clear');
  execFileSync('git', ['switch', '-q', 'main'], { cwd: projectRoot });
  assert.equal(runCli('task', 'start', 'override', '--title', 'Override', '--guided').exitCode, 0);
  assert.equal(activeTask().mode, 'guided');
  runCli('task', 'clear');
  assert.match(runCli('task', 'start', 'bad', '--title', 'Bad', '--mode', 'yolo').output, /Unknown mode "yolo"/);
});
