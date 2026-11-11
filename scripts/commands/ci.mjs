import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findAddedComments } from '../lib/comment-detector.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { findDocumentProblems } from '../lib/documents.mjs';
import { isTestFile } from '../lib/file-rules.mjs';
import { changedFilesSince, fileContentAtRef } from '../lib/git.mjs';
import { isInsideMizanDirectory } from '../lib/paths.mjs';
import { addedLines, findSecretsInLines } from '../lib/secret-scanner.mjs';
import { runShellCommand } from '../lib/shell.mjs';

const FILES_THAT_DO_NOT_NEED_A_CHANGE_NOTE = [/\.md$/i, /^\.github\//, /^LICENSE/, /^\.gitignore$/, /^\.gitattributes$/];

export function runCi({ flags }) {
  const { paths, config, policy } = requireInitializedContext();
  const baseRef = typeof flags.base === 'string' ? flags.base : 'origin/main';
  const changedFiles = changedFilesSince(paths.projectRoot, baseRef);
  const problems = [];

  for (const relativePath of changedFiles) {
    const absolutePath = join(paths.projectRoot, relativePath);
    if (!existsSync(absolutePath) || isInsideMizanDirectory(relativePath)) continue;
    const previousContent = fileContentAtRef(paths.projectRoot, baseRef, relativePath);
    const nextContent = readFileSync(absolutePath, 'utf8');
    const comments = findAddedComments({
      filePath: relativePath,
      previousContent,
      nextContent,
      allowedDirectivePrefixes: config.comments.allowedDirectivePrefixes,
    });
    if (comments.length > 0 && policy.addedComment === 'deny') {
      problems.push(`${relativePath}: adds ${comments.length} code comment(s). Code must explain itself through names. First: "${comments[0].slice(0, 80)}"`);
    }
    const secrets = findSecretsInLines(addedLines(previousContent, nextContent), { isTestFile: isTestFile(relativePath, config) });
    for (const secret of secrets) {
      problems.push(`${relativePath}: possible ${secret.kind}: ${secret.line}`);
    }
  }

  if (policy.changeNoteRequired) {
    const codeChanges = changedFiles.filter((file) => !isInsideMizanDirectory(file) && !FILES_THAT_DO_NOT_NEED_A_CHANGE_NOTE.some((pattern) => pattern.test(file)));
    const changeNotes = changedFiles.filter((file) => file.startsWith('.mizan/changes/') && file.endsWith('.md'));
    if (codeChanges.length > 0 && changeNotes.length === 0) {
      problems.push(`Code changed (${codeChanges.length} file(s)) but no change note was added in .mizan/changes/.`);
    }
    if (codeChanges.length > 0 && !changedFiles.includes('.mizan/log.jsonl')) {
      problems.push('Code changed but .mizan/log.jsonl has no new entry, so nobody can see who changed what and when.');
    }
    for (const note of changeNotes) {
      for (const problem of findDocumentProblems(join(paths.projectRoot, note), 'changeNote')) {
        problems.push(`${note}: ${problem}`);
      }
    }
  }

  const checks = [['Type check', config.commands.typecheck], ['Lint', config.commands.lint], ['Tests', config.commands.test]];
  for (const [label, command] of checks) {
    if (!command) continue;
    const result = runShellCommand(command, { cwd: paths.projectRoot });
    if (!result.succeeded) problems.push(`${label} failed (${command}):\n${result.outputTail}`);
  }

  if (problems.length > 0) {
    process.exitCode = 1;
    return [`Mizan CI found ${problems.length} problem(s) compared with ${baseRef}:`, ...problems.map((problem) => `- ${problem}`)].join('\n');
  }
  return `Mizan CI passed for ${changedFiles.length} changed file(s) compared with ${baseRef}.`;
}
