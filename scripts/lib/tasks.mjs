import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isoDate, isoTimestamp } from './dates.mjs';
import { readJsonFile, readJsonFileOrFallback, writeJsonFile } from './json-files.mjs';

export const TASK_KINDS = {
  feature: ['plan', 'test', 'implement', 'qa', 'review', 'document', 'done'],
  fix: ['investigate', 'plan', 'test', 'implement', 'qa', 'review', 'document', 'done'],
  quick: ['plan', 'test', 'implement', 'review', 'document', 'done'],
};

export const PHASES_WITH_LOCKED_TESTS = new Set(['implement', 'qa', 'review', 'document']);
export const PHASES_WHERE_SCOPE_IS_OPEN = new Set(['investigate', 'plan']);
export const PHASES_THAT_NEED_GREEN_TESTS = new Set(['implement', 'qa', 'review', 'document']);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function taskDirectory(paths, taskId) {
  return join(paths.tasks, taskId);
}

export function taskFile(paths, taskId, fileName) {
  return join(taskDirectory(paths, taskId), fileName);
}

export function createTask(paths, { slug, title, kind, ticket, author, mode, branch }) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Task slug "${slug}" must be lowercase words joined by hyphens, for example "password-reset".`);
  }
  if (!(kind in TASK_KINDS)) {
    throw new Error(`Unknown task kind "${kind}". Use one of: ${Object.keys(TASK_KINDS).join(', ')}.`);
  }
  const taskId = `${isoDate()}-${slug}`;
  if (existsSync(taskFile(paths, taskId, 'state.json'))) {
    throw new Error(`Task ${taskId} already exists. Pick a different slug or resume it with "mizan task resume ${taskId}".`);
  }
  const task = {
    id: taskId,
    title,
    kind,
    mode,
    branch: branch ?? null,
    ticket: ticket ?? null,
    phase: TASK_KINDS[kind][0],
    hasUserInterface: null,
    startedAt: isoTimestamp(),
    startedBy: author.name,
    plannedFiles: [],
    touchedFiles: [],
    evidence: {},
    blocked: null,
    closedAt: null,
  };
  saveTask(paths, task);
  setActiveTaskId(paths, taskId);
  return task;
}

function readTaskState(statePath) {
  try {
    return readJsonFile(statePath, null);
  } catch {
    throw new Error(`${statePath} is not valid JSON. Ask the user to fix it, or clear the task with "mizan task clear".`);
  }
}

export function loadTask(paths, taskId) {
  const task = readTaskState(taskFile(paths, taskId, 'state.json'));
  if (!task) {
    throw new Error(`Task ${taskId} was not found in .mizan/tasks.`);
  }
  return task;
}

export function saveTask(paths, task) {
  writeJsonFile(taskFile(paths, task.id, 'state.json'), task);
}

export function activeTaskId(paths) {
  return readJsonFileOrFallback(paths.activeTask, { taskId: null }).taskId ?? null;
}

export function loadActiveTask(paths) {
  const taskId = activeTaskId(paths);
  if (!taskId) return null;
  const statePath = taskFile(paths, taskId, 'state.json');
  return existsSync(statePath) ? readTaskState(statePath) : null;
}

export function requireActiveTask(paths) {
  const task = loadActiveTask(paths);
  if (!task) {
    throw new Error('There is no active Mizan task. Start one with "mizan task start <slug> --title <title>".');
  }
  return task;
}

export function setActiveTaskId(paths, taskId) {
  writeJsonFile(paths.activeTask, { taskId });
}

export function clearActiveTask(paths) {
  if (existsSync(paths.activeTask)) rmSync(paths.activeTask);
}

export function nextPhaseFor(task) {
  const phases = TASK_KINDS[task.kind];
  const currentIndex = phases.indexOf(task.phase);
  return phases[currentIndex + 1] ?? null;
}

export function isPlannedFile(task, relativePath) {
  return task.plannedFiles.some((planned) => planned.path === relativePath);
}

export function recordTouchedFile(paths, task, relativePath) {
  if (task.touchedFiles.includes(relativePath)) return task;
  const updated = { ...task, touchedFiles: [...task.touchedFiles, relativePath] };
  saveTask(paths, updated);
  return updated;
}
