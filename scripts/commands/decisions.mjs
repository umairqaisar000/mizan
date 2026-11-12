import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { appendLogEntry, readAllLogEntries } from '../lib/audit-log.mjs';
import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isoDate } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { CATEGORIES_THAT_NEED_A_HUMAN, DECISION_CATEGORIES } from '../lib/modes.mjs';
import { loadActiveTask } from '../lib/tasks.mjs';

const REVIEW_OUTCOMES = { accept: 'accepted', reverse: 'reversed' };

export function recordAutoDecision({ paths, config }, { question, flags }) {
  const task = loadActiveTask(paths);
  if (!task || (task.mode ?? 'guided') !== 'auto') {
    throw new Error('Auto decisions are only allowed in an active auto-mode task. In guided mode, ask the user and record it with --kind asked.');
  }
  const category = requireValue(flags.category, `--category (${DECISION_CATEGORIES.join(', ')})`);
  if (!DECISION_CATEGORIES.includes(category)) {
    throw new Error(`Unknown category "${category}". Use one of: ${DECISION_CATEGORIES.join(', ')}.`);
  }
  if (CATEGORIES_THAT_NEED_A_HUMAN.has(category)) {
    throw new Error(`${category} decisions always need a human, even in auto mode. Run "mizan task block <question with options and your recommendation>" and ask the user.`);
  }
  const chosen = requireValue(flags.chosen, '--chosen (the option you picked)');
  const options = requireValue(flags.options, '--options (every option you considered, separated by " | ")').split('|').map((option) => option.trim()).filter(Boolean);
  const reason = requireValue(flags.reason, '--reason (why this option, in one sentence)');
  if (options.length < 2) throw new Error('List at least two options with --options "first | second".');
  const decisionId = `D-${randomBytes(3).toString('hex')}`;
  const author = resolveAuthor(paths.projectRoot);

  appendFileSync(paths.decisions, [
    '',
    `### ${isoDate()} | Auto-decided (${decisionId}, needs review) | ${author.name} via Claude | ${task.id}`,
    '',
    question,
    '',
    `Chosen: ${chosen}`,
    `Options considered: ${options.join('; ')}`,
    `Category: ${category}`,
    `Why: ${reason}`,
    '',
  ].join('\n'));
  appendLogEntry(paths, config, {
    type: 'decision',
    summary: `Auto-decided: ${question} -> ${chosen}`,
    taskId: task.id,
    ticket: task.ticket,
    details: { decisionId, kind: 'auto', question, chosen, options, category, reason },
  });
  return `Auto decision ${decisionId} recorded. Tell the user about it in your next message, then continue.`;
}

export function pendingAutoDecisions(paths) {
  const entries = readAllLogEntries(paths);
  const reviewedIds = new Set(entries.filter((entry) => entry.type === 'decision-reviewed').map((entry) => entry.details?.decisionId));
  return entries
    .filter((entry) => entry.type === 'decision' && entry.details?.kind === 'auto' && !reviewedIds.has(entry.details.decisionId))
    .map((entry) => ({ id: entry.details.decisionId, taskId: entry.taskId, date: entry.date, ...entry.details }));
}

export function runDecisions({ positional }) {
  const { paths, config } = requireInitializedContext();
  const [subcommand, decisionId, ...noteWords] = positional;

  if (subcommand === undefined || subcommand === 'list') {
    const pending = pendingAutoDecisions(paths);
    if (pending.length === 0) return 'No auto decisions are waiting for review.';
    return [
      `${pending.length} auto decision(s) waiting for review:`,
      ...pending.map((decision) => `- [${decision.id}] ${decision.date} ${decision.taskId}: ${decision.question} -> ${decision.chosen} (${decision.category}). Why: ${decision.reason}. Other options: ${decision.options.filter((option) => option !== decision.chosen).join('; ')}`),
    ].join('\n');
  }

  const outcome = REVIEW_OUTCOMES[subcommand];
  if (!outcome) throw new Error('Use "mizan decisions", "mizan decisions accept <id> [note]" or "mizan decisions reverse <id> <reason>".');
  const decision = pendingAutoDecisions(paths).find((pending) => pending.id === decisionId);
  if (!decision) throw new Error(`No pending auto decision with id "${decisionId ?? ''}". Run "mizan decisions" to see them.`);
  const note = noteWords.join(' ');
  if (outcome === 'reversed' && !note) throw new Error('Say why it is being reversed: "mizan decisions reverse <id> <reason>".');
  const author = resolveAuthor(paths.projectRoot);

  appendFileSync(paths.decisions, `\n### ${isoDate()} | Review of ${decision.id}: ${outcome} | ${author.name}\n\n${note || 'No note.'}\n`);
  appendLogEntry(paths, config, {
    type: 'decision-reviewed',
    summary: `Auto decision ${decision.id} ${outcome}: ${decision.question}${note ? ` (${note})` : ''}`,
    taskId: decision.taskId,
    details: { decisionId: decision.id, outcome, note: note || null },
  });
  return outcome === 'reversed'
    ? `Decision ${decision.id} marked reversed. The code still reflects it: start a task to change it, for example /mizan:quick or /mizan:fix.`
    : `Decision ${decision.id} accepted.`;
}
