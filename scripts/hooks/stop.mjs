import { rmSync } from 'node:fs';
import { appendLogEntry } from '../lib/audit-log.mjs';
import { loadMizanContext } from '../lib/context.mjs';
import { findDocumentProblems } from '../lib/documents.mjs';
import { blockWithFeedback, continueWithoutOutput, readHookInput, runHookSafely } from '../lib/hook-io.mjs';
import { readJsonFileOrFallback, writeJsonFile } from '../lib/json-files.mjs';
import { changeNotePath } from '../lib/phase-gates.mjs';
import { runShellCommand } from '../lib/shell.mjs';
import { PHASES_THAT_NEED_GREEN_TESTS, loadActiveTask } from '../lib/tasks.mjs';

const BLOCK_HINT = 'If you are waiting for the user, run ".mizan/.local/mizan task block <your question>" first, then end your turn.';

runHookSafely(() => {
  const input = readHookInput();
  const context = loadMizanContext(input.cwd);
  if (!context.initialized) continueWithoutOutput();
  const { paths, config, policy } = context;

  logEditsMadeOutsideATask(paths, config);

  const task = loadActiveTask(paths);
  const isAutoTask = Boolean(task && task.mode === 'auto' && !task.blocked);
  const needsGreenTests = Boolean(policy.stopGate && task && !task.blocked && PHASES_THAT_NEED_GREEN_TESTS.has(task.phase));
  if (!isAutoTask && !needsGreenTests) {
    resetRetries(paths);
    continueWithoutOutput();
  }

  const retries = readJsonFileOrFallback(paths.session, { stopRetries: 0 }).stopRetries;
  if (retries >= config.stopGate.maxRetries) {
    resetRetries(paths);
    continueWithoutOutput();
  }

  const problems = [];
  if (needsGreenTests && config.commands.test) {
    const result = runShellCommand(config.commands.test, { cwd: paths.projectRoot });
    if (!result.succeeded) problems.push(`Tests are failing in the "${task.phase}" phase:\n${result.outputTail}`);
  }
  if (task.phase === 'document' && policy.changeNoteRequired) {
    const noteProblems = findDocumentProblems(changeNotePath(paths, task.id), 'changeNote');
    if (noteProblems.length > 0) problems.push(`The change note is not finished:\n${noteProblems.map((problem) => `- ${problem}`).join('\n')}`);
  }

  if (isAutoTask) {
    problems.push(`Auto mode: task ${task.id} is in the "${task.phase}" phase and not finished. Keep going without waiting for the user. Stop only for a hard stop (push, deploy, publish, data deletion, schema change, new dependency, security or privacy decision), and block the task before you do.`);
  }
  if (problems.length === 0) {
    resetRetries(paths);
    continueWithoutOutput();
  }
  writeJsonFile(paths.session, { stopRetries: retries + 1 });
  const attemptsLeft = config.stopGate.maxRetries - retries - 1;
  const honestyNote = attemptsLeft === 0 ? ' This is the last automatic retry: if it still fails, tell the user exactly what is failing and why.' : '';
  blockWithFeedback(`${problems.join('\n\n')}\n\n${BLOCK_HINT}${honestyNote}`);
});

function logEditsMadeOutsideATask(paths, config) {
  const { files } = readJsonFileOrFallback(paths.adHocEdits, { files: [] });
  if (files.length === 0) return;
  appendLogEntry(paths, config, {
    type: 'ad-hoc-edit',
    summary: `Edited ${files.length} file(s) without a Mizan task`,
    files,
  });
  rmSync(paths.adHocEdits, { force: true });
}

function resetRetries(paths) {
  rmSync(paths.session, { force: true });
}
