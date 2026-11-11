import { existsSync } from 'node:fs';
import { appendLogEntry } from '../lib/audit-log.mjs';
import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isoDate, isoTimestamp } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { changeNotePath, checkGateForLeavingPhase, rcaPath } from '../lib/phase-gates.mjs';
import { toProjectRelative } from '../lib/paths.mjs';
import {
  TASK_KINDS,
  activeTaskId,
  clearActiveTask,
  createTask,
  loadActiveTask,
  loadTask,
  nextPhaseFor,
  requireActiveTask,
  saveTask,
  setActiveTaskId,
  taskFile,
} from '../lib/tasks.mjs';
import { writeTemplateIfMissing } from '../lib/templates.mjs';
import { writeAutomaticHandoff } from './handoff.mjs';

const TEMPLATE_CREATED_ON_ENTERING_PHASE = {
  qa: { templateName: 'qa.md', fileFor: (paths, task) => taskFile(paths, task.id, 'qa.md') },
  review: { templateName: 'review.md', fileFor: (paths, task) => taskFile(paths, task.id, 'review.md') },
  document: { templateName: 'change-note.md', fileFor: (paths, task) => changeNotePath(paths, task.id) },
};

export function runTask({ positional, flags }) {
  const [subcommand, ...rest] = positional;
  const handler = TASK_SUBCOMMANDS[subcommand];
  if (!handler) {
    throw new Error(`Unknown task command "${subcommand ?? ''}". Use one of: ${Object.keys(TASK_SUBCOMMANDS).join(', ')}.`);
  }
  return handler({ arguments: rest, flags, context: requireInitializedContext() });
}

const TASK_SUBCOMMANDS = {
  start: ({ arguments: [slug], flags, context }) => {
    const { paths, config } = context;
    const existing = loadActiveTask(paths);
    if (existing) {
      throw new Error(`Task ${existing.id} is still active (phase: ${existing.phase}). Finish it or abandon it before starting another.`);
    }
    const author = resolveAuthor(paths.projectRoot);
    const kind = flags.kind ?? 'feature';
    const task = createTask(paths, {
      slug: requireValue(slug, 'task slug, for example "password-reset"'),
      title: requireValue(flags.title, '--title'),
      kind,
      ticket: typeof flags.ticket === 'string' ? flags.ticket : null,
      author,
    });
    const templateValues = templateValuesFor(task, author);
    writeTemplateIfMissing(taskFile(paths, task.id, 'plan.md'), 'plan.md', templateValues);
    if (kind === 'fix') writeTemplateIfMissing(rcaPath(paths, task.id), 'rca.md', templateValues);
    appendLogEntry(paths, config, { type: 'task-started', summary: `Started ${kind}: ${task.title}`, taskId: task.id, ticket: task.ticket });
    return [
      `Started task ${task.id} (${kind}). Phases: ${TASK_KINDS[kind].join(' -> ')}.`,
      `Plan: ${toProjectRelative(paths.projectRoot, taskFile(paths, task.id, 'plan.md'))}`,
      kind === 'fix' ? `RCA: ${toProjectRelative(paths.projectRoot, rcaPath(paths, task.id))}` : null,
    ].filter(Boolean).join('\n');
  },

  next: ({ context }) => {
    const { paths, config, policy } = context;
    const task = requireActiveTask(paths);
    if (task.blocked) {
      throw new Error(`Task is blocked: ${task.blocked.reason}. Run "mizan task unblock" once the user has answered.`);
    }
    const nextPhase = nextPhaseFor(task);
    if (!nextPhase) throw new Error(`Task ${task.id} is already done.`);
    const { problems, evidence } = checkGateForLeavingPhase({ paths, config, policy, task });
    if (problems.length > 0) {
      process.exitCode = 1;
      return [`Cannot leave phase "${task.phase}" yet:`, ...problems.map((problem) => `- ${problem}`)].join('\n');
    }
    const advanced = { ...task, phase: nextPhase, evidence: { ...task.evidence, ...(evidence ?? {}) } };
    if (nextPhase === 'done') return closeTask(context, advanced);
    saveTask(paths, advanced);
    const createdFile = createPhaseTemplate(paths, advanced);
    appendLogEntry(paths, config, { type: 'phase-changed', summary: `${task.phase} -> ${nextPhase}: ${task.title}`, taskId: task.id, ticket: task.ticket });
    return [
      `Task ${task.id} moved from "${task.phase}" to "${nextPhase}".`,
      evidence?.red ? 'Recorded the failing test run as proof the tests came first.' : null,
      evidence?.green ? `All checks green: ${evidence.green.checks.join(', ')}.` : null,
      createdFile ? `Fill in: ${toProjectRelative(paths.projectRoot, createdFile)}` : null,
    ].filter(Boolean).join('\n');
  },

  'set-ui': ({ arguments: [answer], context }) => {
    const task = requireActiveTask(context.paths);
    if (answer !== 'yes' && answer !== 'no') throw new Error('Use "mizan task set-ui yes" or "mizan task set-ui no".');
    saveTask(context.paths, { ...task, hasUserInterface: answer === 'yes' });
    return `Recorded that this task ${answer === 'yes' ? 'changes' : 'does not change'} the user interface.`;
  },

  block: ({ arguments: reasonWords, context }) => {
    const { paths, config } = context;
    const task = requireActiveTask(paths);
    const reason = requireValue(reasonWords.join(' '), 'reason, for example the question for the user');
    saveTask(paths, { ...task, blocked: { reason, at: isoTimestamp() } });
    appendLogEntry(paths, config, { type: 'task-blocked', summary: `Waiting on user: ${reason}`, taskId: task.id, ticket: task.ticket });
    return `Task ${task.id} is blocked until the user answers: ${reason}`;
  },

  unblock: ({ arguments: answerWords, context }) => {
    const { paths, config } = context;
    const task = requireActiveTask(paths);
    if (!task.blocked) return `Task ${task.id} was not blocked.`;
    const answer = answerWords.join(' ');
    saveTask(paths, { ...task, blocked: null });
    appendLogEntry(paths, config, { type: 'task-unblocked', summary: answer ? `Answered: ${answer}` : 'Unblocked', taskId: task.id, ticket: task.ticket });
    return `Task ${task.id} is unblocked.`;
  },

  resume: ({ arguments: [taskId], context }) => {
    const { paths } = context;
    const existing = loadActiveTask(paths);
    if (existing && existing.id !== taskId) throw new Error(`Task ${existing.id} is active. Finish or abandon it first.`);
    const task = loadTask(paths, requireValue(taskId, 'task id'));
    if (task.closedAt) throw new Error(`Task ${task.id} was already closed.`);
    setActiveTaskId(paths, task.id);
    return `Resumed task ${task.id} at phase "${task.phase}".`;
  },

  abandon: ({ arguments: reasonWords, context }) => {
    const { paths, config } = context;
    const task = requireActiveTask(paths);
    const reason = requireValue(reasonWords.join(' '), 'reason');
    saveTask(paths, { ...task, closedAt: isoTimestamp(), abandonedReason: reason });
    clearActiveTask(paths);
    appendLogEntry(paths, config, { type: 'task-abandoned', summary: `Abandoned: ${task.title} (${reason})`, taskId: task.id, ticket: task.ticket, files: task.touchedFiles });
    writeAutomaticHandoff(context);
    return `Task ${task.id} was abandoned. Files touched so far: ${task.touchedFiles.join(', ') || 'none'}.`;
  },

  back: ({ arguments: [targetPhase, ...reasonWords], context }) => {
    const { paths, config } = context;
    const task = requireActiveTask(paths);
    const phases = TASK_KINDS[task.kind];
    const reason = requireValue(reasonWords.join(' '), 'reason, for example "the reviewer found a missing test case"');
    if (!phases.includes(targetPhase) || phases.indexOf(targetPhase) >= phases.indexOf(task.phase)) {
      throw new Error(`"${targetPhase ?? ''}" is not an earlier phase. Earlier phases: ${phases.slice(0, phases.indexOf(task.phase)).join(', ') || 'none'}.`);
    }
    const { red, green, ...keptEvidence } = task.evidence;
    const evidence = phases.indexOf(targetPhase) <= phases.indexOf('test') ? keptEvidence : { ...keptEvidence, ...(red ? { red } : {}) };
    saveTask(paths, { ...task, phase: targetPhase, evidence, blocked: null });
    appendLogEntry(paths, config, { type: 'phase-changed', summary: `${task.phase} -> ${targetPhase} (back): ${reason}`, taskId: task.id, ticket: task.ticket });
    return `Task ${task.id} moved back from "${task.phase}" to "${targetPhase}". Every gate after it runs again.`;
  },

  clear: ({ context }) => {
    const { paths, config } = context;
    const taskId = activeTaskId(paths);
    clearActiveTask(paths);
    appendLogEntry(paths, config, { type: 'note', summary: taskId ? `Cleared the active task ${taskId} without closing it` : 'Cleared the active task pointer', taskId });
    return taskId ? `Task ${taskId} is no longer active. Its files in .mizan/tasks/${taskId} were kept.` : 'There was no active task.';
  },

  show: ({ context }) => {
    const task = requireActiveTask(context.paths);
    return JSON.stringify(task, null, 2);
  },
};

function closeTask(context, task) {
  const { paths, config } = context;
  const closed = { ...task, closedAt: isoTimestamp() };
  saveTask(paths, closed);
  clearActiveTask(paths);
  const notePath = changeNotePath(paths, task.id);
  appendLogEntry(paths, config, {
    type: 'task-closed',
    summary: `Done: ${task.title}`,
    taskId: task.id,
    ticket: task.ticket,
    files: task.touchedFiles,
    details: existsSync(notePath) ? { changeNote: toProjectRelative(paths.projectRoot, notePath) } : null,
  });
  writeAutomaticHandoff(context);
  return `Task ${task.id} is done and logged. Change note: ${existsSync(notePath) ? toProjectRelative(paths.projectRoot, notePath) : 'none (light mode)'}.`;
}

function createPhaseTemplate(paths, task) {
  const entry = TEMPLATE_CREATED_ON_ENTERING_PHASE[task.phase];
  if (!entry) return null;
  const target = entry.fileFor(paths, task);
  writeTemplateIfMissing(target, entry.templateName, templateValuesFor(task, resolveAuthor(paths.projectRoot)));
  return target;
}

function templateValuesFor(task, author) {
  return {
    date: isoDate(),
    author: author.name,
    taskId: task.id,
    title: task.title,
    ticket: task.ticket,
    kind: task.kind,
  };
}
