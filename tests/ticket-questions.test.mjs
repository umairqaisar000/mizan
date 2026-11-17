import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyBashCommand } from '../scripts/lib/bash-rules.mjs';
import { DEFAULT_CONFIG } from '../scripts/lib/config.mjs';
import { checkGateForLeavingPhase } from '../scripts/lib/phase-gates.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let projectRoot;
let environment;

function runCli(...args) {
  const result = spawnSync('node', [join(pluginRoot, 'scripts', 'mizan.mjs'), ...args], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function runHook(name) {
  return spawnSync('node', [join(pluginRoot, 'scripts', 'hooks', `${name}.mjs`)], { cwd: projectRoot, env: environment, input: JSON.stringify({ cwd: projectRoot }), encoding: 'utf8' });
}

function activeTask() {
  const { taskId } = JSON.parse(readFileSync(join(projectRoot, '.mizan/.local/active.json'), 'utf8'));
  return JSON.parse(readFileSync(join(projectRoot, '.mizan/tasks', taskId, 'state.json'), 'utf8'));
}

function setTracker(tracker) {
  const configPath = join(projectRoot, '.mizan/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify({ ...config, tracker: { ...config.tracker, ...tracker } }));
}

function addQuestion(question, extra = []) {
  return runCli('questions', 'add', question, '--category', 'product', '--options', 'Refund in full | Refund the difference', '--recommend', 'Refund the difference', '--why', 'Changes what patients are charged', ...extra);
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-questions-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot };
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Asking Person'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.email', 'ask@example.com'], { cwd: projectRoot });
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'questions', type: 'module', scripts: { test: 'node --test' } }));
  execFileSync('git', ['add', '-A'], { cwd: projectRoot });
  execFileSync('git', ['commit', '-q', '-m', 'start'], { cwd: projectRoot });
  runCli('init');
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('asking on the ticket is off by default and needs a ticket', () => {
  assert.equal(DEFAULT_CONFIG.tracker.askQuestions, false);
  runCli('task', 'start', 'no-ticket', '--title', 'No ticket', '--kind', 'fix', '--auto');
  assert.match(addQuestion('Refund how?').output, /Asking on the ticket is off/);
  setTracker({ name: 'jira', askQuestions: true });
  assert.match(addQuestion('Refund how?').output, /has no ticket/);
  runCli('task', 'clear');
  execFileSync('git', ['switch', '-q', 'main'], { cwd: projectRoot });
});

test('questions are drafted, posted, answered and recorded, and the task resumes on the last answer', () => {
  runCli('task', 'start', 'refunds', '--title', 'Refund rounding', '--kind', 'fix', '--ticket', 'ENG-7', '--auto');
  assert.match(addQuestion('Patient 0551234567 was overcharged. Refund how?').output, /personal data \(phone number\)/);
  assert.match(runCli('questions', 'add', 'Refund how?', '--category', 'product', '--options', 'A | B', '--recommend', 'C', '--why', 'x').output, /must be one of the options/);

  const first = /Q-[0-9a-f]{6}/.exec(addQuestion('Refund in full or only the difference?').output)[0];
  const second = /Q-[0-9a-f]{6}/.exec(addQuestion('Apply to past claims too?').output)[0];
  const posted = runCli('questions', 'posted', '--link', 'https://example.atlassian.net/browse/ENG-7/comment-1');
  assert.equal(posted.exitCode, 0, posted.output);
  assert.equal(activeTask().blocked.waitingOn, 'tracker');
  assert.match(activeTask().blocked.reason, /Waiting for answers on Jira ENG-7/);
  assert.equal(runHook('stop').status, 0);
  assert.match(runCli('task', 'next').output, /mizan:resume/);
  assert.match(runCli('task', 'unblock', 'go on').output, /--skip-ticket/);
  assert.match(runHook('session-start').stdout, /waiting for answers on its ticket/);

  const answerFirst = runCli('questions', 'answer', first, '--by', 'Ops Lead', '--answer', 'Only the difference', '--decision', 'Refund the difference and keep the original charge', '--link', 'https://example.atlassian.net/browse/ENG-7/comment-2');
  assert.match(answerFirst.output, new RegExp(`Still waiting on: ${second}`));
  assert.ok(activeTask().blocked);
  const answerSecond = runCli('questions', 'answer', second, '--by', 'Ops Lead', '--answer', 'No, new claims only', '--decision', 'Leave past claims unchanged', '--link', 'https://example.atlassian.net/browse/ENG-7/comment-3');
  assert.match(answerSecond.output, /unblocked/);
  assert.equal(activeTask().blocked, null);

  const decisions = readFileSync(join(projectRoot, '.mizan/decisions.md'), 'utf8');
  assert.match(decisions, new RegExp(`Asked on Jira \\(${first}, waiting\\) \\| Asking Person via Claude`));
  assert.match(decisions, new RegExp(`Answered on Jira \\(${first}\\) \\| answered by Ops Lead`));
  assert.match(decisions, /Decision: Refund the difference and keep the original charge/);
  assert.match(decisions, /Answer in: https:\/\/example\.atlassian\.net\/browse\/ENG-7\/comment-2/);
  const log = readFileSync(join(projectRoot, '.mizan/log.jsonl'), 'utf8');
  assert.match(log, /"type":"question-asked"/);
  assert.match(log, /"type":"question-answered"/);
  assert.match(runCli('questions', 'answer', first, '--by', 'x', '--answer', 'y', '--decision', 'z', '--link', 'u').output, /is answered, not waiting/);
});

test('Claude needs the user to stop waiting for answers on the ticket', () => {
  const options = { deployCommandPatterns: DEFAULT_CONFIG.approvals.deployCommandPatterns, lockedTestPatterns: [] };
  assert.equal(classifyBashCommand('.mizan/.local/mizan task unblock --skip-ticket carry on', options).decision, 'ask');
  assert.equal(classifyBashCommand('.mizan/.local/mizan questions answer Q-abc123 --by x', options).decision, 'allow');
});

test('the teach-back check is offered by default, can be required, and only the person can confirm it', () => {
  assert.equal(DEFAULT_CONFIG.learning.teachBack, 'offer');
  const options = { deployCommandPatterns: DEFAULT_CONFIG.approvals.deployCommandPatterns, lockedTestPatterns: [] };
  assert.equal(classifyBashCommand('.mizan/.local/mizan understood they explained the rounding', options).decision, 'ask');
  assert.equal(classifyBashCommand('.mizan/.local/mizan concepts add idempotency --explain x', options).decision, 'allow');

  const recorded = runCli('understood', 'Explained that the refund now uses the difference and why');
  assert.match(recorded.output, /Recorded that Asking Person understood/);
  assert.equal(activeTask().understanding.outcome, 'understood');
  assert.match(readFileSync(join(projectRoot, '.mizan/log.jsonl'), 'utf8'), /"type":"understanding-checked"/);
  assert.match(runCli('understood', '--skipped').output, /Missing reason the check was skipped/);

  const configPath = join(projectRoot, '.mizan/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify({ ...config, learning: { teachBack: 'sometimes' } }));
  assert.match(runCli('status').output, /Unknown learning.teachBack "sometimes"/);
  writeFileSync(configPath, JSON.stringify(config));
});

test('learning notes live outside the project and never repeat a concept', () => {
  const learningHome = mkdtempSync(join(tmpdir(), 'mizan-learning-'));
  environment = { ...environment, MIZAN_HOME: learningHome };
  assert.match(runCli('concepts').output, /No concepts recorded yet/);
  assert.match(runCli('concepts', 'add', 'Idempotency', '--explain', 'Doing it twice has the same effect as once. The refund job can rerun safely.').output, /Added "Idempotency"/);
  assert.match(runCli('concepts', 'add', 'idempotency', '--explain', 'again').output, /already in your learning notes/);
  assert.match(runCli('concepts', 'add', 'Lookup', '--explain', 'Call 0551234567 for help').output, /personal data/);
  assert.match(readFileSync(join(learningHome, 'learning.md'), 'utf8'), /## Idempotency\n\nDoing it twice/);
  assert.match(runCli('concepts').output, /Idempotency/);
  rmSync(learningHome, { recursive: true, force: true });
});

test('when the teach-back is required, the task cannot close until the person understood it', () => {
  const task = { id: 't', kind: 'feature', phase: 'document', contextSources: [] };
  const policy = { changeNoteRequired: false };
  const requiredConfig = { ...DEFAULT_CONFIG, learning: { teachBack: 'required' } };
  assert.match(checkGateForLeavingPhase({ paths: {}, config: requiredConfig, policy, task }).problems.join(), /Teach-back check/);
  assert.match(checkGateForLeavingPhase({ paths: {}, config: requiredConfig, policy, task: { ...task, understanding: { outcome: 'skipped' } } }).problems.join(), /Teach-back check/);
  assert.deepEqual(checkGateForLeavingPhase({ paths: {}, config: requiredConfig, policy, task: { ...task, understanding: { outcome: 'understood' } } }).problems, []);
  assert.deepEqual(checkGateForLeavingPhase({ paths: {}, config: DEFAULT_CONFIG, policy, task }).problems, []);
});
