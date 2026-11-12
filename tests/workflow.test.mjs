import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(pluginRoot, 'scripts', 'mizan.mjs');
const hookPath = (name) => join(pluginRoot, 'scripts', 'hooks', `${name}.mjs`);

let projectRoot;
let environment;

function filledDocument(headings) {
  return headings.map((heading) => `## ${heading}\n\nDone for ${heading.toLowerCase()}.\n`).join('\n');
}

function runCli(...args) {
  const result = spawnSync('node', [cliPath, ...args], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function runHook(name, payload) {
  const result = spawnSync('node', [hookPath(name)], {
    cwd: projectRoot,
    env: environment,
    input: JSON.stringify({ cwd: projectRoot, ...payload }),
    encoding: 'utf8',
  });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeProjectFile(relativePath, content) {
  writeFileSync(join(projectRoot, relativePath), content);
}

function readProjectFile(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

function logEntries() {
  return readProjectFile('.mizan/log.jsonl').trim().split('\n').map((line) => JSON.parse(line));
}

function activeTaskId() {
  return JSON.parse(readProjectFile('.mizan/.local/active.json')).taskId;
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-workflow-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot, MIZAN_AUTHOR_NAME: '', MIZAN_AUTHOR_EMAIL: '' };
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Test Person'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.email', 'test.person@example.com'], { cwd: projectRoot });
  execFileSync('mkdir', ['-p', 'src'], { cwd: projectRoot });
  writeProjectFile('package.json', JSON.stringify({ name: 'demo', type: 'module', scripts: { test: 'node --test' } }, null, 2));
  writeProjectFile('src/sum.mjs', 'export const sum = (a, b) => 0;\n');
  writeProjectFile('.env', 'SECRET=real\n');
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('a feature task moves through every phase with its gates enforced', () => {
  const init = runCli('init');
  assert.equal(init.exitCode, 0, init.output);
  assert.match(init.output, /Author for the log: Test Person/);
  assert.ok(existsSync(join(projectRoot, '.mizan/.local/mizan')));
  assert.match(readProjectFile('.gitignore'), /\.mizan\/\.local\//);
  assert.equal(logEntries()[0].author, 'Test Person');
  assert.equal(logEntries()[0].email, undefined);

  assert.equal(runCli('task', 'start', 'add-sum', '--title', 'Add numbers').exitCode, 0);
  const taskId = activeTaskId();
  const taskFolder = `.mizan/tasks/${taskId}`;

  const unfilledPlan = runCli('task', 'next');
  assert.equal(unfilledPlan.exitCode, 1);
  assert.match(unfilledPlan.output, /"## Goal" is not filled in/);
  assert.match(unfilledPlan.output, /No files are in scope/);

  writeProjectFile(`${taskFolder}/plan.md`, filledDocument(['Goal', 'Acceptance criteria', 'Approach', 'Alternatives considered', 'Existing code to reuse', 'Files', 'Tests', 'User experience', 'Security', 'Decisions and questions', 'Approval']));
  runCli('scope', 'add', 'src/sum.mjs', '--reason', 'implements the sum');
  runCli('task', 'set-ui', 'no');
  assert.equal(runCli('task', 'next').exitCode, 0);

  const outOfScope = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'src/other.mjs'), content: 'export const other = 1;\n' } });
  assert.equal(outOfScope.exitCode, 0);
  const warning = runHook('post-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'src/other.mjs') } });
  assert.equal(warning.exitCode, 2);
  assert.match(warning.stderr, /not in this task's scope/);

  const withComment = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'src/sum.mjs'), content: '// adds numbers\nexport const sum = (a, b) => a + b;\n' } });
  assert.equal(withComment.exitCode, 2);
  assert.match(withComment.stderr, /adds 1 code comment/);

  writeProjectFile('src/sum.test.mjs', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\n\ntest('adds two numbers', () => {\n  assert.equal(sum(2, 3), 5);\n});\n");
  const red = runCli('task', 'next');
  assert.equal(red.exitCode, 0, red.output);
  assert.match(red.output, /failing test run/);

  const lockedTest = runHook('pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: join(projectRoot, 'src/sum.test.mjs'), old_string: '5', new_string: '0' } });
  assert.equal(lockedTest.exitCode, 2);
  assert.match(lockedTest.stderr, /Tests are locked/);

  const stillRed = runHook('stop', {});
  assert.equal(stillRed.exitCode, 2);
  assert.match(stillRed.stderr, /Tests are failing/);

  writeProjectFile('src/sum.mjs', 'export const sum = (first, second) => first + second;\n');
  const green = runCli('task', 'next');
  assert.equal(green.exitCode, 0, green.output);
  assert.match(green.output, /All checks green/);
  assert.equal(runHook('stop', {}).exitCode, 0);

  writeProjectFile(`${taskFolder}/qa.md`, '## Result\n\nNOT_APPLICABLE: no user interface.\n');
  assert.equal(runCli('task', 'next').exitCode, 0);

  writeProjectFile(`${taskFolder}/review.md`, '## Result\n\nPASS\n\n## Blocking findings\n\nnone\n\n## Non-blocking findings\n\nnone\n\n## Security\n\nNo input handling.\n');
  const toDocument = runCli('task', 'next');
  assert.equal(toDocument.exitCode, 0, toDocument.output);
  assert.ok(existsSync(join(projectRoot, `.mizan/changes/${taskId}.md`)));

  const unfinishedNote = runHook('stop', {});
  assert.equal(unfinishedNote.exitCode, 2);
  assert.match(unfinishedNote.stderr, /change note is not finished/);

  writeProjectFile(`.mizan/changes/${taskId}.md`, `# Add numbers\n\n${filledDocument(['In one sentence', 'What changed', 'Why', 'Where', 'How it works', 'How to check it yourself', 'Security', 'Risks and follow-ups'])}`);
  const done = runCli('task', 'next');
  assert.equal(done.exitCode, 0, done.output);
  assert.match(done.output, /done and logged/);

  const closed = logEntries().find((entry) => entry.type === 'task-closed');
  assert.equal(closed.author, 'Test Person');
  assert.equal(closed.taskId, taskId);
  assert.ok(existsSync(join(projectRoot, '.mizan/handoff.md')));
  assert.equal(existsSync(join(projectRoot, '.mizan/.local/active.json')), false);
});

test('secrets, protected files and risky commands are guarded', () => {
  const fakeGithubToken = ['ghp', 'x'.repeat(36)].join('_');
  const readEnv = runHook('pre-tool-use', { tool_name: 'Read', tool_input: { file_path: join(projectRoot, '.env') } });
  assert.equal(readEnv.exitCode, 2);

  const writeEnv = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, '.env'), content: 'X=1\n' } });
  assert.equal(writeEnv.exitCode, 2);

  const secret = runHook('pre-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'src/client.mjs'), content: `export const token = "${fakeGithubToken}";\n` } });
  assert.equal(secret.exitCode, 2);
  assert.match(secret.stderr, /GitHub token/);

  const install = runHook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'npm install left-pad' } });
  assert.equal(install.exitCode, 0);
  assert.equal(JSON.parse(install.stdout).hookSpecificOutput.permissionDecision, 'ask');

  const dependencyEdit = runHook('pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: join(projectRoot, 'package.json'), old_string: '"scripts"', new_string: '"dependencies": { "left-pad": "1.3.0" },\n  "scripts"' } });
  assert.equal(JSON.parse(dependencyEdit.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('edits made without a task are logged when the turn ends', () => {
  runHook('post-tool-use', { tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'src/sum.mjs') } });
  assert.equal(runHook('stop', {}).exitCode, 0);
  const adHoc = logEntries().filter((entry) => entry.type === 'ad-hoc-edit').pop();
  assert.deepEqual(adHoc.files, ['src/sum.mjs']);
  assert.equal(adHoc.author, 'Test Person');
});

test('session start briefs Claude with the rules and recent history', () => {
  const briefing = runHook('session-start', {});
  assert.equal(briefing.exitCode, 0);
  const context = JSON.parse(briefing.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /Mizan is active\. Strictness: standard\. Default mode: guided\. Working as: Test Person\./);
  assert.match(context, /Done: Add numbers/);
  assert.match(context, /No comments/);
  assert.ok(context.length < 4000, `briefing is ${context.length} characters`);
});

test('the digest groups finished work by person', () => {
  const digest = runCli('digest', '--days', '1');
  assert.equal(digest.exitCode, 0);
  assert.match(digest.output, /Test Person: Add numbers/);
  assert.match(digest.output, /Edits outside a task/);
});
