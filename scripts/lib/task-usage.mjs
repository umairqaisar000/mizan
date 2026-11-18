import { existsSync, rmSync } from 'node:fs';
import { appendLogEntry } from './audit-log.mjs';
import { readJsonFileOrFallback } from './json-files.mjs';
import { loadActiveTask, loadTask, saveTask } from './tasks.mjs';
import { describeUsage, hasUsage, mergeUsage, readNewUsage } from './usage.mjs';
import { estimateCostUsd } from './pricing.mjs';

export function recordTaskUsage({ paths, config }, transcriptPath) {
  if (!config.log.trackUsage) return;
  const byModel = readNewUsage(paths.usageCursor, transcriptPath);
  const recentlyClosedId = readJsonFileOrFallback(paths.recentlyClosed, { taskId: null }).taskId;
  if (recentlyClosedId) {
    finalizeClosedTask({ paths, config }, recentlyClosedId, byModel);
    return;
  }
  const task = loadActiveTask(paths);
  if (task && hasUsage(byModel)) saveTask(paths, { ...task, usage: mergeUsage(task.usage, byModel) });
}

function finalizeClosedTask({ paths, config }, taskId, byModel) {
  if (existsSync(paths.recentlyClosed)) rmSync(paths.recentlyClosed);
  const task = loadTask(paths, taskId);
  const usage = mergeUsage(task.usage, byModel);
  saveTask(paths, { ...task, usage });
  if (usage.totalTokens === 0) return;
  appendLogEntry(paths, config, {
    type: 'task-cost',
    summary: `Cost of "${task.title}": ${describeUsage(usage)}`,
    taskId: task.id,
    ticket: task.ticket,
    details: {
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      byModel: Object.fromEntries(Object.entries(usage.byModel).map(([model, tokens]) => [model, { tokens, estimatedCostUsd: estimateCostUsd(model, tokens) }])),
    },
  });
}
