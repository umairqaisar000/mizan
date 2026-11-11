import { rmSync } from 'node:fs';
import { loadMizanContext } from '../lib/context.mjs';
import { shouldLintSingleFile } from '../lib/file-rules.mjs';
import { blockWithFeedback, continueWithoutOutput, readHookInput, runHookSafely } from '../lib/hook-io.mjs';
import { readJsonFileOrFallback, writeJsonFile } from '../lib/json-files.mjs';
import { isInsideMizanDirectory, isOutsideProject, toProjectRelative } from '../lib/paths.mjs';
import { runShellCommand } from '../lib/shell.mjs';
import { loadActiveTask, recordTouchedFile } from '../lib/tasks.mjs';

const SINGLE_FILE_LINT_TIMEOUT_MS = 60 * 1000;
const LINT_OUTPUT_LINES = 20;

runHookSafely(() => {
  const input = readHookInput();
  const context = loadMizanContext(input.cwd);
  if (!context.initialized) continueWithoutOutput();
  const { paths, config } = context;
  const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  const feedback = takePendingWarnings(paths);

  if (filePath) {
    const relativePath = toProjectRelative(paths.projectRoot, filePath);
    if (!isOutsideProject(relativePath) && !isInsideMizanDirectory(relativePath)) {
      trackEditedFile(paths, relativePath);
      feedback.push(...lintEditedFile(paths, config, relativePath));
    }
  }

  if (feedback.length > 0) blockWithFeedback(feedback.join('\n'));
  continueWithoutOutput();
});

function trackEditedFile(paths, relativePath) {
  const task = loadActiveTask(paths);
  if (task) {
    recordTouchedFile(paths, task, relativePath);
    return;
  }
  const adHoc = readJsonFileOrFallback(paths.adHocEdits, { files: [] });
  if (!adHoc.files.includes(relativePath)) {
    writeJsonFile(paths.adHocEdits, { files: [...adHoc.files, relativePath] });
  }
}

function lintEditedFile(paths, config, relativePath) {
  if (!config.commands.lintFile || !shouldLintSingleFile(relativePath, config)) return [];
  const command = config.commands.lintFile.replace('{file}', shellQuote(relativePath));
  const result = runShellCommand(command, { cwd: paths.projectRoot, timeoutMs: SINGLE_FILE_LINT_TIMEOUT_MS, tailLines: LINT_OUTPUT_LINES });
  return result.succeeded ? [] : [`Lint problems in ${relativePath}. Fix them now:\n${result.outputTail}`];
}

function takePendingWarnings(paths) {
  const { warnings } = readJsonFileOrFallback(paths.pendingWarnings, { warnings: [] });
  if (warnings.length > 0) rmSync(paths.pendingWarnings, { force: true });
  return [...warnings];
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
