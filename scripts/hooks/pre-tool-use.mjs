import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { classifyBashCommand, pathsModifiedBy } from '../lib/bash-rules.mjs';
import { extractComments, findAddedComments } from '../lib/comment-detector.mjs';
import { loadMizanContext } from '../lib/context.mjs';
import { describeDependencyChange, findDependencyChanges } from '../lib/dependency-changes.mjs';
import { isMizanControlFile, isProtectedFile, isSecretBearingFile, isTestFile } from '../lib/file-rules.mjs';
import { askUserToConfirm, blockWithFeedback, continueWithoutOutput, readHookInput, runHookSafely } from '../lib/hook-io.mjs';
import { matchesAnyGlob } from '../lib/glob.mjs';
import { readJsonFileOrFallback, writeJsonFile } from '../lib/json-files.mjs';
import { isInsideMizanDirectory, isOutsideProject, toProjectRelative } from '../lib/paths.mjs';
import { findPersonalData } from '../lib/personal-data.mjs';
import { addedLines, findSecretsInLines } from '../lib/secret-scanner.mjs';
import { PHASES_WHERE_SCOPE_IS_OPEN, PHASES_WITH_LOCKED_TESTS, isPlannedFile, loadActiveTask } from '../lib/tasks.mjs';

const FILE_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const HOOK_EVENT = 'PreToolUse';
const CONFIG_RELATIVE_PATH = '.mizan/config.json';
const SCOPE_ADD_COMMAND = /\bmizan\s+scope\s+add\b/;

runHookSafely(() => {
  const input = readHookInput();
  const context = loadMizanContext(input.cwd);
  if (!context.initialized) continueWithoutOutput();
  const toolName = input.tool_name;
  const toolInput = input.tool_input ?? {};

  if (toolName === 'Read') checkFileRead(context, toolInput.file_path);
  if (toolName === 'Grep') checkGrep(context, toolInput);
  if (context.configError && (toolName === 'Bash' || FILE_WRITING_TOOLS.has(toolName))) blockUnlessFixingConfig(context, toolName, toolInput);
  if (toolName === 'Bash') checkBashCommand(context, toolInput.command ?? '');
  if (FILE_WRITING_TOOLS.has(toolName)) checkFileWrite(context, toolName, toolInput);
  continueWithoutOutput();
}, { failClosed: true });

function blockUnlessFixingConfig({ paths, configError }, toolName, toolInput) {
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  const isFixingConfig = filePath && toProjectRelative(paths.projectRoot, filePath) === CONFIG_RELATIVE_PATH;
  if (isFixingConfig) askUserToConfirm(HOOK_EVENT, `Fixing .mizan/config.json, which is currently broken: ${configError}`);
  blockWithFeedback(`${configError} Mizan cannot check this ${toolName === 'Bash' ? 'command' : 'edit'} until the config is fixed. Show the user the problem and offer to fix .mizan/config.json.`);
}

function checkBashCommand({ paths, config, policy }, command) {
  const task = loadActiveTask(paths);
  const testsAreLocked = Boolean(task && PHASES_WITH_LOCKED_TESTS.has(task.phase) && policy.lockedTestEdit !== 'off');
  const { decision, reason, category } = classifyBashCommand(command, {
    deployCommandPatterns: config.approvals.deployCommandPatterns,
    lockedTestPatterns: testsAreLocked ? config.paths.tests : [],
  });
  if (decision === 'deny') blockWithFeedback(reason);
  if (decision === 'deny-test-lock') {
    if (policy.lockedTestEdit === 'deny') blockWithFeedback(reason);
    queueWarning(paths, reason);
  }
  if (decision === 'ask' && !(category === 'dependency' && policy.newDependency === 'allow')) {
    askUserToConfirm(HOOK_EVENT, reason);
  }

  const touchedControlFile = pathsModifiedBy(command)
    .map((path) => toProjectRelative(paths.projectRoot, path.replace(/^['"]+|['"]+$/g, '')))
    .find((relativePath) => isMizanControlFile(relativePath));
  if (touchedControlFile) {
    askUserToConfirm(HOOK_EVENT, `This command changes ${touchedControlFile}, which controls Mizan's own guardrails. The user decides.`);
  }
  if (task && SCOPE_ADD_COMMAND.test(command) && !PHASES_WHERE_SCOPE_IS_OPEN.has(task.phase)) {
    askUserToConfirm(HOOK_EVENT, `This widens the task's scope during the "${task.phase}" phase, after the plan was approved. The user decides.`);
  }
}

function checkFileRead({ paths, config }, filePath) {
  if (!filePath) return;
  const relativePath = toProjectRelative(paths.projectRoot, filePath);
  if (isSecretBearingFile(relativePath, config) || isSecretBearingFile(basename(filePath), config)) {
    blockWithFeedback(`${relativePath} holds secrets and must not be read into the conversation. Ask the user for the specific non-secret value you need, or read the matching .env.example.`);
  }
}

function checkGrep({ paths, config }, toolInput) {
  const targets = [toolInput.path, toolInput.glob].filter(Boolean);
  const targetsSecretFile = targets.some((target) => {
    const relativePath = toProjectRelative(paths.projectRoot, target);
    return isSecretBearingFile(relativePath, config) || isSecretBearingFile(basename(target), config) || /(?:^|[/{,])\.env(?:[.*}]|$)/.test(target);
  });
  if (targetsSecretFile) {
    blockWithFeedback('Searching inside .env or key files would put secrets into the conversation. Search .env.example instead, or ask the user.');
  }
}

function checkFileWrite(context, toolName, toolInput) {
  const { paths, config, policy } = context;
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  if (!filePath) return;
  const relativePath = toProjectRelative(paths.projectRoot, filePath);

  if (isOutsideProject(relativePath)) {
    checkWriteOutsideProject(context, toolName, toolInput, filePath);
    return;
  }
  if (isProtectedFile(relativePath, config)) {
    blockWithFeedback(`${relativePath} is protected (secrets, keys, git internals or the audit log). Ask the user to change it themselves.`);
  }
  if (isMizanControlFile(relativePath)) {
    askUserToConfirm(HOOK_EVENT, `This edits ${relativePath}, which controls Mizan's own guardrails (strictness, task phase or scope). The user decides.`);
  }
  if (isInsideMizanDirectory(relativePath)) {
    checkMizanDocument(toolName, toolInput, filePath, relativePath);
    return;
  }

  const task = loadActiveTask(paths);
  if (!task && policy.editWithoutTask === 'deny') {
    blockWithFeedback('Strict mode: every edit needs an active task. Start one with /mizan:build, /mizan:fix or /mizan:quick.');
  }

  if (task?.mode === 'auto' && matchesAnyGlob(relativePath, config.paths.schemaChanges)) {
    askUserToConfirm(HOOK_EVENT, `Auto mode hard stop: ${relativePath} changes the database schema, which is hard to undo once it runs. The user decides.`);
  }

  const isTest = isTestFile(relativePath, config);
  const holdsSampleValues = isTest || /\.(?:example|sample|template)$/.test(relativePath);
  if (task && isTest && PHASES_WITH_LOCKED_TESTS.has(task.phase)) {
    const message = `Tests are locked in the "${task.phase}" phase, so ${relativePath} cannot change. If the test is wrong, stop, explain why, and ask the user. Going back to the test phase needs their approval ("mizan task back test").`;
    if (policy.lockedTestEdit === 'deny') blockWithFeedback(message);
    if (policy.lockedTestEdit === 'warn') queueWarning(paths, message);
  }

  if (task && !isTest && !isPlannedFile(task, relativePath) && !PHASES_WHERE_SCOPE_IS_OPEN.has(task.phase)) {
    const message = `${relativePath} is not in this task's scope. If it truly must change, explain why to the user and add it with: .mizan/.local/mizan scope add ${relativePath} --reason "<why>". Otherwise leave it alone.`;
    if (policy.outOfScopeEdit === 'deny') blockWithFeedback(message);
    if (policy.outOfScopeEdit === 'warn') queueWarning(paths, message);
  }

  const previousContent = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  if (toolName === 'NotebookEdit') {
    checkNotebookCell(context, toolInput.new_source ?? '', holdsSampleValues);
    return;
  }
  const nextContent = contentAfterTool(toolName, toolInput, previousContent);
  if (nextContent === null) return;

  blockIfSecrets(addedLines(previousContent, nextContent), holdsSampleValues);
  reportComments(context, findAddedComments({
    filePath: relativePath,
    previousContent,
    nextContent,
    allowedDirectivePrefixes: config.comments.allowedDirectivePrefixes,
  }));

  if (basename(relativePath) === 'package.json' && policy.newDependency === 'ask') {
    const changes = findDependencyChanges(previousContent, nextContent);
    if (changes.length > 0) {
      askUserToConfirm(HOOK_EVENT, `This changes dependencies: ${changes.map(describeDependencyChange).join('; ')}. New or upgraded packages need the user's approval.`);
    }
  }
}

function checkMizanDocument(toolName, toolInput, filePath, relativePath) {
  if (!relativePath.endsWith('.md')) return;
  const previousContent = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const nextContent = contentAfterTool(toolName, toolInput, previousContent);
  if (nextContent === null) return;
  const added = addedLines(previousContent, nextContent);
  blockIfSecrets(added, false);
  const personalData = findPersonalData(added);
  if (personalData.length > 0) {
    blockWithFeedback(`${relativePath} is committed to git, and this edit adds what looks like personal data (${personalData.join(', ')}). Describe it in general terms instead, for example "one patient's claim" or "the ops lead".`);
  }
}

function checkWriteOutsideProject({ config }, toolName, toolInput, filePath) {
  if (isProtectedFile(basename(filePath), config)) {
    blockWithFeedback(`${filePath} looks like a secrets or key file outside the project. Ask the user to change it themselves.`);
  }
  const content = toolName === 'NotebookEdit' ? toolInput.new_source : toolName === 'Write' ? toolInput.content : toolInput.new_string;
  const multiEditContent = (toolInput.edits ?? []).map((edit) => edit.new_string ?? '').join('\n');
  blockIfSecrets(`${content ?? ''}\n${multiEditContent}`.split('\n'), false);
}

function checkNotebookCell(context, newSource, isTest) {
  blockIfSecrets(newSource.split('\n'), isTest);
  const comments = extractComments(newSource, 'hash')
    .map((comment) => comment.trim())
    .filter((comment) => comment !== '' && !context.config.comments.allowedDirectivePrefixes.some((prefix) => comment.startsWith(prefix)));
  reportComments(context, comments);
}

function blockIfSecrets(lines, isTest) {
  const secrets = findSecretsInLines(lines, { isTestFile: isTest });
  if (secrets.length > 0) {
    blockWithFeedback(`This edit adds what looks like a secret (${secrets.map((secret) => secret.kind).join(', ')}). Read it from configuration or environment instead, and never commit real credentials.`);
  }
}

function reportComments({ paths, policy }, comments) {
  if (comments.length === 0) return;
  const message = `This edit adds ${comments.length} code comment(s), starting with "${comments[0].slice(0, 80)}". Code must explain itself: rename things or extract a well-named function instead of commenting. Put reasoning in the change note.`;
  if (policy.addedComment === 'deny') blockWithFeedback(message);
  queueWarning(paths, message);
}

function contentAfterTool(toolName, toolInput, previousContent) {
  if (toolName === 'Write') return toolInput.content ?? '';
  if (toolName === 'Edit') return applyEdit(previousContent, toolInput);
  if (toolName === 'MultiEdit') {
    return (toolInput.edits ?? []).reduce((content, edit) => (content === null ? null : applyEdit(content, edit)), previousContent);
  }
  return null;
}

function applyEdit(content, { old_string: oldText = '', new_string: newText = '', replace_all: replaceAll = false }) {
  if (oldText === '') return content === '' ? newText : null;
  if (!content.includes(oldText)) return null;
  return replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, () => newText);
}

function queueWarning(paths, message) {
  const existing = readJsonFileOrFallback(paths.pendingWarnings, { warnings: [] });
  writeJsonFile(paths.pendingWarnings, { warnings: [...existing.warnings, message] });
}
