import { appendFileSync } from 'node:fs';
import { appendLogEntry } from '../lib/audit-log.mjs';
import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isoDate } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { loadActiveTask } from '../lib/tasks.mjs';
import { recordAutoDecision } from './decisions.mjs';

const DECISION_KINDS = {
  asked: 'Asked the user',
  inferred: 'Inferred (user was told)',
  auto: 'Auto-decided',
};

export function runLog({ positional, flags }) {
  const { paths, config } = requireInitializedContext();
  const summary = requireValue(positional.join(' '), 'summary of what happened');
  const task = loadActiveTask(paths);
  const files = typeof flags.files === 'string' ? flags.files.split(',').map((file) => file.trim()).filter(Boolean) : [];
  const entry = appendLogEntry(paths, config, {
    type: flags.type ?? 'note',
    summary,
    taskId: task?.id ?? null,
    ticket: task?.ticket ?? null,
    files,
  });
  return `Logged at ${entry.at} as ${entry.author}.`;
}

export function runDecision({ positional, flags }) {
  const { paths, config } = requireInitializedContext();
  const text = requireValue(positional.join(' '), 'the decision');
  const kind = requireValue(flags.kind, `--kind (${Object.keys(DECISION_KINDS).join(', ')})`);
  if (!(kind in DECISION_KINDS)) throw new Error(`Unknown decision kind "${kind}". Use: ${Object.keys(DECISION_KINDS).join(', ')}.`);
  if (kind === 'auto') return recordAutoDecision({ paths, config }, { question: text, flags });
  const task = loadActiveTask(paths);
  const author = resolveAuthor(paths.projectRoot);
  const answer = typeof flags.answer === 'string' ? flags.answer : null;
  const lines = [
    '',
    `### ${isoDate()} | ${DECISION_KINDS[kind]} | ${author.name}${task ? ` | ${task.id}` : ''}`,
    '',
    text,
    answer ? `\nAnswer: ${answer}` : null,
  ].filter((line) => line !== null);
  appendFileSync(paths.decisions, `${lines.join('\n')}\n`);
  appendLogEntry(paths, config, { type: 'decision', summary: `${DECISION_KINDS[kind]}: ${text}${answer ? ` -> ${answer}` : ''}`, taskId: task?.id ?? null, ticket: task?.ticket ?? null });
  return 'Decision recorded in .mizan/decisions.md.';
}

export function runRule({ positional }) {
  const [subcommand, ...ruleWords] = positional;
  if (subcommand !== 'add') throw new Error('Use "mizan rule add <rule text>".');
  const { paths, config } = requireInitializedContext();
  const rule = requireValue(ruleWords.join(' '), 'rule text');
  const author = resolveAuthor(paths.projectRoot);
  appendFileSync(paths.rules, `- ${rule} (added ${isoDate()} by ${author.name})\n`);
  appendLogEntry(paths, config, { type: 'rule-added', summary: `New project rule: ${rule}` });
  return 'Rule added to .mizan/rules.md. It will be loaded at the start of every session.';
}
