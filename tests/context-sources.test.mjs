import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../scripts/lib/config.mjs';
import { findPersonalData } from '../scripts/lib/personal-data.mjs';

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

function activeTaskId() {
  return JSON.parse(readFileSync(join(projectRoot, '.mizan/.local/active.json'), 'utf8')).taskId;
}

function setContextSources(sources) {
  const configPath = join(projectRoot, '.mizan/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify({ ...config, context: sources }));
}

function filledPlanSections() {
  return ['Goal', 'Acceptance criteria', 'Approach', 'Alternatives considered', 'Existing code to reuse', 'Files', 'Tests', 'User experience', 'Security', 'Decisions and questions', 'Approval']
    .map((heading) => `## ${heading}\n\nDone.\n`).join('\n');
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-context-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot };
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Context Person'], { cwd: projectRoot });
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'context', type: 'module', scripts: { test: 'node --test' } }));
  runCli('init');
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('every context source is off by default', () => {
  assert.deepEqual(DEFAULT_CONFIG.context, { linear: false, granola: false, gmail: false });
  const started = runCli('task', 'start', 'no-context', '--title', 'No context');
  assert.doesNotMatch(started.output, /Gather context first/);
  assert.equal(existsSync(join(projectRoot, '.mizan/tasks', activeTaskId(), 'context.md')), false);
  runCli('task', 'clear');
});

test('with sources on, the task cannot leave planning until the context is gathered', () => {
  setContextSources({ linear: true, granola: true, gmail: false });
  const started = runCli('task', 'start', 'with-context', '--title', 'With context', '--ticket', 'ENG-1');
  assert.match(started.output, /Gather context first \(read only, linear, granola\)/);
  const taskFolder = join(projectRoot, '.mizan/tasks', activeTaskId());
  assert.match(readFileSync(join(taskFolder, 'context.md'), 'utf8'), /Sources enabled: linear, granola/);

  writeFileSync(join(taskFolder, 'plan.md'), filledPlanSections());
  runCli('scope', 'add', 'src/a.mjs', '--reason', 'feature');
  runCli('task', 'set-ui', 'no');
  const blocked = runCli('task', 'next');
  assert.equal(blocked.exitCode, 1);
  assert.match(blocked.output, /Context: Section "## Sources checked" is not filled in/);

  writeFileSync(join(taskFolder, 'context.md'), ['Sources checked', 'What is being asked for', 'Requirements found', 'Decisions already made', 'Open questions and conflicts', 'Sensitive data'].map((heading) => `## ${heading}\n\nDone.\n`).join('\n'));
  assert.equal(runCli('task', 'next').exitCode, 0);
  runCli('task', 'clear');
  setContextSources({ linear: false, granola: false, gmail: false });
});

test('personal data cannot be written into Mizan documents', () => {
  const withEmail = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '.mizan/tasks/x/context.md'), content: '## Sources checked\n\nReported by someone@clinic.sa\n' } });
  assert.equal(withEmail.status, 2);
  assert.match(withEmail.stderr, /personal data \(email address\)/);
  const clean = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '.mizan/tasks/x/context.md'), content: '## Sources checked\n\nReported by the ops lead on 5 Nov in Linear ENG-1.\n' } });
  assert.equal(clean.status, 0);
});

test('the personal data check catches real details and ignores ordinary numbers', () => {
  assert.deepEqual(findPersonalData(['Patient ID 1098765432']), ['national ID or iqama number']);
  assert.deepEqual(findPersonalData(['Call 0551234567']), ['phone number']);
  assert.deepEqual(findPersonalData(['Updated 2026-11-12T00:46:51.669Z', 'total 1000000000 cents', 'port 5173', 'commit 16feb98']), []);
});
