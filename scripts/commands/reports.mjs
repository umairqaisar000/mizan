import { formatLogEntryLine, readAllLogEntries, readRecentLogEntries } from '../lib/audit-log.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { daysAgo, isoDate } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { readJsonFileOrFallback } from '../lib/json-files.mjs';
import { loadActiveTask, nextPhaseFor } from '../lib/tasks.mjs';

const DEFAULT_DIGEST_DAYS = 7;

export function runWhoami() {
  const { paths } = requireInitializedContext();
  const author = resolveAuthor(paths.projectRoot);
  return `${author.name}${author.email ? ` <${author.email}>` : ''}`;
}

export function runStatus() {
  const { paths, config } = requireInitializedContext();
  const task = loadActiveTask(paths);
  const adHocEdits = readJsonFileOrFallback(paths.adHocEdits, { files: [] }).files;
  const lines = [`Strictness: ${config.strictness}`];
  if (task) {
    lines.push(
      `Active task: ${task.id} "${task.title}" (${task.kind})`,
      `Phase: ${task.phase}${nextPhaseFor(task) ? ` (next: ${nextPhaseFor(task)})` : ''}`,
      task.blocked ? `Blocked: ${task.blocked.reason}` : null,
      task.ticket ? `Ticket: ${task.ticket}` : null,
      `In scope: ${task.plannedFiles.map((planned) => planned.path).join(', ') || 'none yet'}`,
      `Touched: ${task.touchedFiles.join(', ') || 'none yet'}`,
    );
    const outOfScope = task.touchedFiles.filter((file) => !task.plannedFiles.some((planned) => planned.path === file));
    if (outOfScope.length > 0) lines.push(`Touched outside the plan: ${outOfScope.join(', ')}`);
  } else {
    lines.push('Active task: none');
  }
  if (adHocEdits.length > 0) lines.push(`Edits not under a task (will be logged): ${adHocEdits.join(', ')}`);
  lines.push('', 'Recent activity:', ...readRecentLogEntries(paths, 8).map((entry) => `- ${formatLogEntryLine(entry)}`));
  return lines.filter((line) => line !== null).join('\n');
}

export function runDigest({ flags }) {
  const { paths } = requireInitializedContext();
  const dayCount = Number(flags.days ?? DEFAULT_DIGEST_DAYS);
  if (!Number.isInteger(dayCount) || dayCount <= 0) throw new Error('--days must be a positive whole number.');
  const since = isoDate(daysAgo(dayCount));
  const entries = readAllLogEntries(paths).filter((entry) => entry.date >= since);
  const closed = entries.filter((entry) => entry.type === 'task-closed');
  const started = entries.filter((entry) => entry.type === 'task-started');
  const adHoc = entries.filter((entry) => entry.type === 'ad-hoc-edit');
  const decisions = entries.filter((entry) => entry.type === 'decision');
  const abandoned = entries.filter((entry) => entry.type === 'task-abandoned');
  const byAuthor = groupCount(entries, (entry) => entry.author);

  return [
    `# Mizan digest: ${since} to ${isoDate()}`,
    '',
    `Finished: ${closed.length}. Started: ${started.length}. Abandoned: ${abandoned.length}. Edits outside a task: ${adHoc.length}. Decisions: ${decisions.length}.`,
    '',
    '## Finished',
    ...listOrNone(closed.map((entry) => `- ${entry.date} ${entry.author}: ${entry.summary.replace(/^Done: /, '')}${entry.ticket ? ` (${entry.ticket})` : ''}${entry.details?.changeNote ? `, see ${entry.details.changeNote}` : ''}`)),
    '',
    '## Abandoned',
    ...listOrNone(abandoned.map((entry) => `- ${entry.date} ${entry.author}: ${entry.summary.replace(/^Abandoned: /, '')}`)),
    '',
    '## Decisions',
    ...listOrNone(decisions.map((entry) => `- ${entry.date} ${entry.author}: ${entry.summary}`)),
    '',
    '## Edits outside a task',
    ...listOrNone(adHoc.map((entry) => `- ${entry.date} ${entry.author}: ${entry.files.join(', ')}`)),
    '',
    '## Activity by person',
    ...listOrNone([...byAuthor.entries()].map(([author, count]) => `- ${author}: ${count} logged events`)),
  ].join('\n');
}

function groupCount(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return counts;
}

function listOrNone(lines) {
  return lines.length > 0 ? lines : ['- None.'];
}
