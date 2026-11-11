import { readRecentLogEntries, formatLogEntryLine } from '../lib/audit-log.mjs';
import { isoTimestamp } from '../lib/dates.mjs';
import { parseSections } from '../lib/documents.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { readTextFile, writeTextFile } from '../lib/json-files.mjs';
import { loadActiveTask } from '../lib/tasks.mjs';
import { requireInitializedContext } from '../lib/context.mjs';

const NOTES_HEADING = 'Notes from the last session';

export function runHandoff() {
  const context = requireInitializedContext();
  writeAutomaticHandoff(context);
  return readTextFile(context.paths.handoff);
}

export function writeAutomaticHandoff({ paths }) {
  const previousNotes = parseSections(readTextFile(paths.handoff)).get(NOTES_HEADING) ?? '';
  const task = loadActiveTask(paths);
  const author = resolveAuthor(paths.projectRoot);
  const recent = readRecentLogEntries(paths, 5).map((entry) => `- ${formatLogEntryLine(entry)}`);
  const taskLines = task
    ? [
        `- Active task: ${task.id} "${task.title}" (${task.kind}), phase: ${task.phase}`,
        task.blocked ? `- Blocked, waiting on the user: ${task.blocked.reason}` : null,
        task.ticket ? `- Ticket: ${task.ticket}` : null,
        `- Files touched: ${task.touchedFiles.join(', ') || 'none yet'}`,
        task.evidence.red ? `- Failing tests recorded at ${task.evidence.red.at}` : null,
        task.evidence.green ? `- Last all-green check at ${task.evidence.green.at}` : null,
      ].filter(Boolean)
    : ['- No active task.'];

  const content = [
    '# Handoff',
    '',
    `Updated ${isoTimestamp()} by ${author.name}.`,
    '',
    '## Where things stand',
    '',
    ...taskLines,
    '',
    '## Recent activity',
    '',
    ...(recent.length > 0 ? recent : ['- Nothing logged yet.']),
    '',
    `## ${NOTES_HEADING}`,
    '',
    previousNotes || 'None yet. Run /mizan:handoff before ending a session to leave notes for the next person.',
    '',
  ].join('\n');
  writeTextFile(paths.handoff, content);
}
