import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyBashCommand } from '../scripts/lib/bash-rules.mjs';
import { DEFAULT_CONFIG } from '../scripts/lib/config.mjs';
import { buildMizanPaths } from '../scripts/lib/paths.mjs';
import { checkGateForLeavingPhase } from '../scripts/lib/phase-gates.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let projectRoot;
let environment;

function runCli(...args) {
  const result = spawnSync('node', [join(pluginRoot, 'scripts', 'mizan.mjs'), ...args], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function writeRca(taskId, label, rootCause) {
  mkdirSync(join(projectRoot, '.mizan/rca'), { recursive: true });
  writeFileSync(join(projectRoot, '.mizan/rca', `${taskId}.md`), `## Symptom\n\nTotals are off by a cent.\n\n## Root cause\n\n${rootCause}\n\n## Root cause label\n\n\`${label}\`\n\n## Fix\n\nSplit in whole cents and hand out the remainder.\n`);
}

function reviewGate(acceptanceCriteria) {
  const taskId = 'gate-check';
  const paths = buildMizanPaths(projectRoot);
  mkdirSync(join(paths.tasks, taskId), { recursive: true });
  writeFileSync(join(paths.tasks, taskId, 'review.md'), ['Result', 'Acceptance criteria', 'Prediction check', 'Blocking findings', 'Non-blocking findings', 'Security']
    .map((heading) => `## ${heading}\n\n${heading === 'Result' ? 'PASS' : heading === 'Acceptance criteria' ? acceptanceCriteria : 'none'}\n`).join('\n'));
  const config = { ...DEFAULT_CONFIG, commands: { ...DEFAULT_CONFIG.commands, test: 'true' } };
  return checkGateForLeavingPhase({ paths, config, policy: { changeNoteRequired: true }, task: { id: taskId, kind: 'feature', phase: 'review', contextSources: [] } }).problems;
}

before(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'mizan-learning-'));
  const { NODE_TEST_CONTEXT: ignoredTestContext, ...parentEnvironment } = process.env;
  environment = { ...parentEnvironment, CLAUDE_PROJECT_DIR: projectRoot, CLAUDE_PLUGIN_ROOT: pluginRoot };
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Rule Person'], { cwd: projectRoot });
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'learning', type: 'module', scripts: { test: 'node --test' } }));
  runCli('init');
});

after(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('review cannot pass while an acceptance criterion is not met, even with green tests', () => {
  assert.match(reviewGate('1. MET: totals add up.\n2. NOT MET: works, but rounds the wrong way for refunds.').join('\n'), /Acceptance criterion not met: 2\. NOT MET/);
  assert.match(reviewGate('Looks fine.').join('\n'), /Mark each acceptance criterion/);
  assert.deepEqual(reviewGate('1. MET: totals add up (test passes, browser shows 33.34).'), []);
});

test('plans must predict their effect and RCAs must label the cause before planning', () => {
  runCli('task', 'start', 'predict', '--title', 'Predict', '--kind', 'fix');
  const taskId = JSON.parse(readFileSync(join(projectRoot, '.mizan/.local/active.json'), 'utf8')).taskId;
  writeFileSync(join(projectRoot, '.mizan/rca', `${taskId}.md`), ['Symptom', 'Reproduction', 'Evidence', 'Root cause'].map((heading) => `## ${heading}\n\nDone.\n`).join('\n'));
  assert.match(runCli('task', 'next').output, /Root cause label/);
  runCli('task', 'clear');
});

test('rules keep their reason and track record, and doctor flags the ones to review', () => {
  assert.match(runCli('rule', 'add', 'Split money in whole cents.').output, /Missing --why/);
  const added = runCli('rule', 'add', 'Split money in whole cents.', '--why', 'Rounding each share lost a cent on uneven splits.');
  const ruleId = /R-[0-9a-f]{6}/.exec(added.output)[0];
  assert.match(readFileSync(join(projectRoot, '.mizan/rules.md'), 'utf8'), new RegExp(`\\[${ruleId}\\] Split money in whole cents\\. Why: Rounding each share`));
  assert.match(runCli('rule', 'held', ruleId, 'Stopped per-share rounding in the tip split').output, /prevented a problem/);
  assert.match(runCli('rule', 'recurred', ruleId, 'Refunds still rounded each line').output, /came back/);
  assert.match(runCli('rule', 'list').output, /Prevented: 1\. Came back: 1\./);
  assert.match(runCli('doctor').output, new RegExp(`REVIEW Rule ${ruleId} .*came back 1 time`));

  const options = { deployCommandPatterns: DEFAULT_CONFIG.approvals.deployCommandPatterns, lockedTestPatterns: [] };
  assert.equal(classifyBashCommand(`.mizan/.local/mizan rule retire ${ruleId} replaced`, options).decision, 'ask');
  assert.match(runCli('rule', 'retire', ruleId, 'Replaced by the Money type').output, /retired/);
  assert.doesNotMatch(readFileSync(join(projectRoot, '.mizan/rules.md'), 'utf8'), new RegExp(ruleId));
  assert.match(readFileSync(join(projectRoot, '.mizan/rules.json'), 'utf8'), /"status": ?"retired"/);
});

test('root causes are indexed by label, searchable, and repeats are flagged', () => {
  writeRca('2026-11-01-tip-split', 'rounding-each-part', 'Each share is rounded on its own. The leftover cent is dropped.');
  writeRca('2026-11-09-refund-split', 'rounding-each-part', 'Each refund line is rounded separately.');
  writeRca('2026-11-10-login', 'missing-null-check', 'The session can be null after logout.');
  const found = runCli('causes', 'rounded');
  assert.match(found.output, /rounding-each-part \(2 times\)/);
  assert.doesNotMatch(found.output, /missing-null-check/);
  assert.match(runCli('causes', 'teleport').output, /No earlier root cause matches/);
  assert.match(runCli('doctor').output, /REVIEW Root cause "rounding-each-part" has come up 2 times/);
  assert.match(runCli('digest').output, /rounding-each-part: 2 times/);
});

test('a missed prediction is logged and shows in the digest', () => {
  runCli('log', 'Prediction missed: the refund test would pass, actually it still fails for negative totals', '--type', 'prediction-missed');
  assert.match(runCli('digest').output, /## Predictions that missed\n- .*Prediction missed: the refund test/);
});
