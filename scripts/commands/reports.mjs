import { formatLogEntryLine, readAllLogEntries, readRecentLogEntries } from '../lib/audit-log.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { daysAgo, isoDate } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { readJsonFileOrFallback } from '../lib/json-files.mjs';
import { loadActiveTask, nextPhaseFor } from '../lib/tasks.mjs';
import { describeUsage, formatTokenCount } from '../lib/usage.mjs';
import { recurringCauses } from './causes.mjs';

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
      config.log.trackUsage ? `Cost so far: ${describeUsage(task.usage)}` : null,
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
  const costs = entries.filter((entry) => entry.type === 'task-cost');
  const costByAuthor = new Map();
  for (const entry of costs) {
    const current = costByAuthor.get(entry.author) ?? { tokens: 0, usd: 0, tasks: 0 };
    costByAuthor.set(entry.author, { tokens: current.tokens + (entry.details?.totalTokens ?? 0), usd: current.usd + (entry.details?.estimatedCostUsd ?? 0), tasks: current.tasks + 1 });
  }
  const totalCost = costs.reduce((sum, entry) => sum + (entry.details?.estimatedCostUsd ?? 0), 0);

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
    `## Cost (estimated at API list prices, total about $${totalCost.toFixed(2)})`,
    ...listOrNone(costs.map((entry) => `- ${entry.date} ${entry.author}: ${entry.summary.replace(/^Cost of /, '')}`)),
    ...[...costByAuthor.entries()].map(([author, cost]) => `- ${author} in total: ${cost.tasks} task(s), ${formatTokenCount(cost.tokens)} tokens, about $${cost.usd.toFixed(2)}`),
    '',
    '## Predictions that missed',
    ...listOrNone(entries.filter((entry) => entry.type === 'prediction-missed').map((entry) => `- ${entry.date} ${entry.author}: ${entry.summary}${entry.taskId ? ` [${entry.taskId}]` : ''}`)),
    '',
    '## Root causes seen more than once (all time)',
    ...listOrNone(recurringCauses(paths).map(([label, causeEntries]) => `- ${label}: ${causeEntries.length} times (${causeEntries.map((entry) => entry.taskId).join(', ')})`)),
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
