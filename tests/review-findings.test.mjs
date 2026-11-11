import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyBashCommand } from '../scripts/lib/bash-rules.mjs';
import { findAddedComments } from '../scripts/lib/comment-detector.mjs';
import { DEFAULT_CONFIG } from '../scripts/lib/config.mjs';
import { findSecretsInLines } from '../scripts/lib/secret-scanner.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { deployCommandPatterns: DEFAULT_CONFIG.approvals.deployCommandPatterns, lockedTestPatterns: [] };
const lockedOptions = { ...options, lockedTestPatterns: DEFAULT_CONFIG.paths.tests };

let projectRoot;
let environment;

function decisionFor(command, classifyOptions = options) {
  return classifyBashCommand(command, classifyOptions).decision;
}

function runHook(name, payload) {
  return spawnSync('node', [join(pluginRoot, 'scripts', 'hooks', `${name}.mjs`)], {
    cwd: projectRoot,
    env: environment,
    input: JSON.stringify({ cwd: projectRoot, ...payload }),
    encoding: 'utf8',
  });
}

function runCli(...args) {
  const result = spawnSync('node', [join(pluginRoot, 'scripts', 'mizan.mjs'), ...args], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function permissionDecision(hookResult) {
  return JSON.parse(hookResult.stdout).hookSpecificOutput.permissionDecision;
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-review-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot };
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Review Person'], { cwd: projectRoot });
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'review', type: 'module', scripts: { test: 'node --test' } }));
  runCli('init');
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('a broken config blocks risky actions instead of switching guardrails off', () => {
  writeFileSync(join(projectRoot, '.mizan/config.json'), '{ "strictness": "standard", }');
  const readEnv = runHook('pre-tool-use', { tool_name: 'Read', tool_input: { file_path: join(projectRoot, '.env') } });
  assert.equal(readEnv.status, 2);
  const command = runHook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(command.status, 2);
  assert.match(command.stderr, /not valid JSON/);
  const fixConfig = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '.mizan/config.json'), content: '{}' } });
  assert.equal(permissionDecision(fixConfig), 'ask');
  writeFileSync(join(projectRoot, '.mizan/config.json'), JSON.stringify({ strictness: 'standard', commands: { test: 'node --test' } }));
});

test('a corrupted active task pointer is ignored and the task can be cleared', () => {
  mkdirSync(join(projectRoot, '.mizan/.local'), { recursive: true });
  writeFileSync(join(projectRoot, '.mizan/.local/active.json'), '{"taskId": "2026');
  assert.equal(runCli('status').exitCode, 0);
  assert.equal(runCli('task', 'clear').exitCode, 0);
  assert.equal(runCli('task', 'start', 'fresh-start', '--title', 'Fresh').exitCode, 0);
  assert.equal(runCli('task', 'clear').exitCode, 0);
});

test('Claude must ask before editing Mizan control files', () => {
  const config = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '.mizan/config.json'), content: '{"strictness":"light"}' } });
  assert.equal(permissionDecision(config), 'ask');
  const state = runHook('pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: join(projectRoot, '.mizan/tasks/2026-01-01-x/state.json'), old_string: 'a', new_string: 'b' } });
  assert.equal(permissionDecision(state), 'ask');
  const viaShell = runHook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'echo {} > .mizan/.local/active.json' } });
  assert.equal(permissionDecision(viaShell), 'ask');
  const plan = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '.mizan/tasks/2026-01-01-x/plan.md'), content: '# Plan\n' } });
  assert.equal(plan.status, 0);
  assert.equal(plan.stdout, '');
});

test('Grep cannot search inside secret files, and notebooks and outside writes are scanned', () => {
  assert.equal(runHook('pre-tool-use', { tool_name: 'Grep', tool_input: { pattern: 'KEY', path: join(projectRoot, '.env') } }).status, 2);
  assert.equal(runHook('pre-tool-use', { tool_name: 'Grep', tool_input: { pattern: 'KEY', glob: '.env*' } }).status, 2);
  assert.equal(runHook('pre-tool-use', { tool_name: 'Grep', tool_input: { pattern: 'KEY', path: projectRoot } }).status, 0);
  const notebook = runHook('pre-tool-use', { tool_name: 'NotebookEdit', tool_input: { notebook_path: join(projectRoot, 'analysis.ipynb'), new_source: 'key = "AKIAIOSFODNN7EXAMPLE"' } });
  assert.equal(notebook.status, 2);
  const notebookComment = runHook('pre-tool-use', { tool_name: 'NotebookEdit', tool_input: { notebook_path: join(projectRoot, 'analysis.ipynb'), new_source: '# explain\nx = 1' } });
  assert.equal(notebookComment.status, 2);
  const outside = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '..', 'sibling', '.env'), content: 'A=1\n' } });
  assert.equal(outside.status, 2);
});

test('every common way of adding a dependency asks first', () => {
  for (const command of ['npm i -D vitest', 'npm install --save-dev zod', 'pnpm add -D x', 'yarn add --dev x', 'bun add -d x', 'pip install -U requests', 'uv add httpx', 'cargo add serde', 'go get example.com/mod', 'gem install rails', 'composer require monolog/monolog']) {
    assert.equal(decisionFor(command), 'ask', command);
  }
  for (const command of ['npm install', 'npm ci', 'pnpm install --frozen-lockfile', 'pip install -r requirements.txt', 'pip install -e .', 'yarn']) {
    assert.equal(decisionFor(command), 'allow', command);
  }
});

test('deploy and environment checks only fire on real deploys and dumps', () => {
  for (const command of ['echo deploy', 'git log --grep deploy', 'cat deploy.sh', 'git diff src/env.ts']) {
    assert.equal(decisionFor(command), 'allow', command);
  }
  for (const command of ['npm run deploy', './scripts/deploy.sh', 'npx vercel --prod', 'printenv OPENAI_API_KEY', 'env']) {
    assert.equal(decisionFor(command), 'ask', command);
  }
  assert.equal(decisionFor('git diff .env'), 'deny');
  assert.equal(decisionFor('cp .env.example .env'), 'allow');
  assert.equal(decisionFor('cp .env .env.backup'), 'deny');
});

test('dangerous deletes are caught in all their usual spellings', () => {
  for (const command of ['rm -rf ..', 'rm -rf ~/', 'rm -rf "$HOME"', 'rm -rf -- /', 'sudo rm -fr /', 'rm --recursive --force .']) {
    assert.equal(decisionFor(command), 'deny', command);
  }
  assert.equal(decisionFor('rm -rf ./dist'), 'allow');
});

test('locked tests cannot be changed through git', () => {
  assert.equal(decisionFor('git checkout -- tests/login.test.ts', lockedOptions), 'deny-test-lock');
  assert.equal(decisionFor('git mv src/a.test.ts src/b.test.ts', lockedOptions), 'deny-test-lock');
  assert.equal(decisionFor('git status', lockedOptions), 'allow');
});

test('normal sample values and translations are not mistaken for secrets', () => {
  assert.deepEqual(findSecretsInLines(['DATABASE_URL=postgres://user:password@localhost:5432/app'], { isTestFile: false }), []);
  assert.deepEqual(findSecretsInLines(['"password": "Password"', '{ password: "Passwort" }'], { isTestFile: false }), []);
  assert.equal(findSecretsInLines(['DATABASE_URL=postgres://admin:Xk29fLq8mZ@prod-db.internal.io/app'], { isTestFile: false }).length, 1);
});

test('tool directives are allowed and one-line JSX comments are caught', () => {
  const allowed = DEFAULT_CONFIG.comments.allowedDirectivePrefixes;
  assert.deepEqual(findAddedComments({ filePath: 'main.go', previousContent: '', nextContent: '//go:embed static\nvar files embed.FS\n', allowedDirectivePrefixes: allowed }), []);
  assert.deepEqual(findAddedComments({ filePath: 'Dockerfile', previousContent: '', nextContent: '# syntax=docker/dockerfile:1\nFROM node:22\n', allowedDirectivePrefixes: allowed }), []);
  assert.deepEqual(findAddedComments({ filePath: 'src/a.ts', previousContent: '', nextContent: 'const x = /*#__PURE__*/ make();\n', allowedDirectivePrefixes: allowed }), []);
  assert.deepEqual(findAddedComments({ filePath: 'src/a.tsx', previousContent: '', nextContent: 'const v = <b>x</b> {/* c */};\n', allowedDirectivePrefixes: allowed }), ['c']);
});

test('a task can go back a phase, which reopens the tests and needs approval', () => {
  assert.equal(decisionFor('.mizan/.local/mizan task back test "reviewer found a missing case"'), 'ask');
  runCli('task', 'start', 'go-back', '--title', 'Go back');
  const statePath = join(projectRoot, '.mizan/tasks');
  const taskId = JSON.parse(execFileSync('cat', [join(projectRoot, '.mizan/.local/active.json')], { encoding: 'utf8' })).taskId;
  const state = JSON.parse(execFileSync('cat', [join(statePath, taskId, 'state.json')], { encoding: 'utf8' }));
  writeFileSync(join(statePath, taskId, 'state.json'), JSON.stringify({ ...state, phase: 'review' }));
  const back = runCli('task', 'back', 'test', 'missing', 'case');
  assert.equal(back.exitCode, 0, back.output);
  assert.match(back.output, /moved back from "review" to "test"/);
  assert.equal(runCli('task', 'back', 'review', 'forward').exitCode, 1);
  runCli('task', 'clear');
});

test('the digest lists abandoned tasks', () => {
  runCli('task', 'start', 'dropped', '--title', 'Dropped idea');
  runCli('task', 'abandon', 'not', 'needed');
  assert.match(runCli('digest', '--days', '1').output, /## Abandoned\n- \S+ Review Person: Dropped idea/);
});
