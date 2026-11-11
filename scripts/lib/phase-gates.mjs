import { join } from 'node:path';
import { findDocumentProblems, readResultLine } from './documents.mjs';
import { isoTimestamp } from './dates.mjs';
import { runShellCommand } from './shell.mjs';
import { taskFile } from './tasks.mjs';

const RCA_SECTIONS_NEEDED_BEFORE_PLANNING = ['Symptom', 'Reproduction', 'Evidence', 'Root cause'];

export function changeNotePath(paths, taskId) {
  return join(paths.changes, `${taskId}.md`);
}

export function rcaPath(paths, taskId) {
  return join(paths.rca, `${taskId}.md`);
}

export function checkGateForLeavingPhase({ paths, config, policy, task }) {
  const gate = GATES_BY_PHASE_BEING_LEFT[task.phase];
  return gate ? gate({ paths, config, policy, task }) : { problems: [], evidence: null };
}

const GATES_BY_PHASE_BEING_LEFT = {
  investigate: ({ paths, task }) => {
    const problems = findDocumentProblems(rcaPath(paths, task.id), 'rca')
      .filter((problem) => RCA_SECTIONS_NEEDED_BEFORE_PLANNING.some((heading) => problem.includes(`"## ${heading}"`)) || problem.includes('does not exist'));
    return { problems, evidence: null };
  },

  plan: ({ paths, task }) => {
    const problems = findDocumentProblems(taskFile(paths, task.id, 'plan.md'), 'plan');
    if (task.plannedFiles.length === 0) {
      problems.push('No files are in scope yet. Add each file the plan will touch with "mizan scope add <path> --reason <why>".');
    }
    if (task.hasUserInterface === null) {
      problems.push('Say whether this task changes the user interface with "mizan task set-ui yes" or "mizan task set-ui no".');
    }
    return { problems, evidence: null };
  },

  test: ({ paths, config, policy }) => {
    if (!policy.requireFailingTestsFirst) return { problems: [], evidence: null };
    if (!config.commands.test) {
      return { problems: ['No test command is configured. Set commands.test in .mizan/config.json.'], evidence: null };
    }
    const result = runShellCommand(config.commands.test, { cwd: paths.projectRoot });
    if (result.succeeded) {
      return {
        problems: ['The test suite passes, so there is no failing test for the new behaviour yet. Write tests that fail for the right reason first.'],
        evidence: null,
      };
    }
    return { problems: [], evidence: { red: { at: isoTimestamp(), outputTail: result.outputTail } } };
  },

  implement: (context) => checkEverythingIsGreen(context),

  qa: ({ paths, config, task }) => {
    const qaFile = taskFile(paths, task.id, 'qa.md');
    const result = readResultLine(qaFile);
    const problems = [];
    if (task.hasUserInterface) {
      problems.push(...findDocumentProblems(qaFile, 'qa'));
      if (result !== 'PASS') problems.push(`Browser QA result is "${result ?? 'missing'}". It must be PASS before review.`);
    } else if (result !== 'PASS' && result !== 'NOT_APPLICABLE') {
      problems.push(`QA result is "${result ?? 'missing'}". Write qa.md with "## Result" PASS, or NOT_APPLICABLE with a reason for non-UI work.`);
    }
    if (config.commands.e2e && problems.length === 0) {
      const e2e = runShellCommand(config.commands.e2e, { cwd: paths.projectRoot });
      if (!e2e.succeeded) problems.push(`End-to-end tests failed:\n${e2e.outputTail}`);
    }
    return { problems, evidence: null };
  },

  review: (context) => {
    const reviewFile = taskFile(context.paths, context.task.id, 'review.md');
    const problems = findDocumentProblems(reviewFile, 'review');
    const result = readResultLine(reviewFile);
    if (result !== 'PASS') problems.push(`Review result is "${result ?? 'missing'}". Fix the blocking findings and review again.`);
    if (problems.length > 0) return { problems, evidence: null };
    return checkEverythingIsGreen(context);
  },

  document: ({ paths, policy, task }) => {
    if (!policy.changeNoteRequired) return { problems: [], evidence: null };
    const problems = findDocumentProblems(changeNotePath(paths, task.id), 'changeNote');
    if (task.kind === 'fix') {
      problems.push(...findDocumentProblems(rcaPath(paths, task.id), 'rca'));
    }
    return { problems, evidence: null };
  },
};

function checkEverythingIsGreen({ paths, config }) {
  const checks = [
    ['Type check', config.commands.typecheck],
    ['Lint', config.commands.lint],
    ['Tests', config.commands.test],
  ].filter(([, command]) => Boolean(command));
  if (!config.commands.test) {
    return { problems: ['No test command is configured. Set commands.test in .mizan/config.json.'], evidence: null };
  }
  const problems = [];
  for (const [label, command] of checks) {
    const result = runShellCommand(command, { cwd: paths.projectRoot });
    if (!result.succeeded) {
      problems.push(`${label} failed (${command}):\n${result.outputTail}`);
    }
  }
  return problems.length > 0
    ? { problems, evidence: null }
    : { problems, evidence: { green: { at: isoTimestamp(), checks: checks.map(([label]) => label) } } };
}
