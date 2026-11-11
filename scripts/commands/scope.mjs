import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isOutsideProject, toProjectRelative } from '../lib/paths.mjs';
import { requireActiveTask, saveTask } from '../lib/tasks.mjs';

export function runScope({ positional, flags }) {
  const [subcommand, filePath] = positional;
  const { paths } = requireInitializedContext();
  const task = requireActiveTask(paths);

  if (subcommand === 'list') {
    if (task.plannedFiles.length === 0) return 'No files in scope yet.';
    return task.plannedFiles.map((planned) => `${planned.path}: ${planned.reason}`).join('\n');
  }
  if (subcommand === 'add') {
    const relativePath = toProjectRelative(paths.projectRoot, requireValue(filePath, 'file path'));
    if (isOutsideProject(relativePath)) throw new Error(`${filePath} is outside the project.`);
    const reason = requireValue(flags.reason, '--reason explaining why this file must change');
    const withoutDuplicate = task.plannedFiles.filter((planned) => planned.path !== relativePath);
    saveTask(paths, { ...task, plannedFiles: [...withoutDuplicate, { path: relativePath, reason }] });
    return `In scope: ${relativePath} (${reason})`;
  }
  if (subcommand === 'remove') {
    const relativePath = toProjectRelative(paths.projectRoot, requireValue(filePath, 'file path'));
    saveTask(paths, { ...task, plannedFiles: task.plannedFiles.filter((planned) => planned.path !== relativePath) });
    return `Removed from scope: ${relativePath}`;
  }
  throw new Error('Use "mizan scope add <path> --reason <why>", "mizan scope remove <path>" or "mizan scope list".');
}
