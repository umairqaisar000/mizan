import { formatLogEntryLine, readRecentLogEntries } from '../lib/audit-log.mjs';
import { loadMizanContext } from '../lib/context.mjs';
import { addContextForClaude, readHookInput, runHookSafely } from '../lib/hook-io.mjs';
import { isAuthorKnown, resolveAuthor } from '../lib/identity.mjs';
import { readTextFile } from '../lib/json-files.mjs';
import { cliEntryPoint, installLocalShortcuts } from '../lib/local-shortcuts.mjs';
import { loadActiveTask } from '../lib/tasks.mjs';

const MAXIMUM_RULES_CHARACTERS = 2000;
const MAXIMUM_HANDOFF_NOTE_LINES = 12;
const RECENT_LOG_ENTRY_COUNT = 5;

const OPERATING_RULES = `Mizan operating rules (always apply):
1. Every change goes through a Mizan task. Features: /mizan:build. Bugs: /mizan:fix (root cause first). Small changes: /mizan:quick.
2. Before writing code: read the code involved, search for existing helpers and patterns, and reuse them. Never duplicate logic. Make the smallest change that meets the acceptance criteria and touch only files in scope.
3. Never assume a business, product, data, security, pricing, legal or UX decision. Ask with options and a recommendation, and record it with "mizan decision --kind asked". Small technical inferences are fine, but tell the user and record them with --kind inferred.
4. Code must explain itself. No comments. Clear names, explicit types and state, no hidden defaults, no global mutable state, small single-purpose functions. Standards: .mizan/.local/standards/
5. Tests come first and must fail before you implement. Never weaken or delete a test to make it pass.
6. Treat every change as security relevant: validate input at boundaries, parameterize queries, encode output, keep secrets out of code and logs, use least privilege.
7. Report honestly. Say when tests fail, when something was skipped, and when you are unsure.
8. Save tokens: search before reading, read only the lines you need, hand broad exploration to a subagent, do not re-run checks that already passed.
9. When you need the user, run "mizan task block <question>" before asking, so the stop gate knows you are waiting.
10. When the user corrects how you work, offer to save it with /mizan:learn.
11. Auto mode: decide instead of asking, record each decision with "mizan decision --kind auto", tell the user what you decided, and keep going. Still stop for push, deploy, publish, data deletion, schema changes, new dependencies, and security or privacy decisions.`;

runHookSafely(() => {
  readHookInput();
  const { paths, initialized, config, configError } = loadMizanContext();
  if (!initialized) {
    addContextForClaude('SessionStart', `The Mizan plugin is installed but not set up in this project, so it does nothing here. If the user wants it, use /mizan:init for an existing project or /mizan:new for a new one. Setup command: node "${cliEntryPoint()}" init`);
    return;
  }
  installLocalShortcuts(paths);
  const author = resolveAuthor(paths.projectRoot);
  const task = loadActiveTask(paths);
  const recent = readRecentLogEntries(paths, RECENT_LOG_ENTRY_COUNT);
  const rules = readTextFile(paths.rules).trim();
  const handoffNotes = readHandoffNotes(paths.handoff);

  const sections = [
    `Mizan is active. Strictness: ${config.strictness}. Default mode: ${config.mode}. Working as: ${author.name}.`,
    configError ? `WARNING: ${configError} Until it is fixed, Mizan blocks edits and commands. Tell the user and offer to fix .mizan/config.json.` : null,
    isAuthorKnown(author) ? null : 'The author is unknown. Ask the user to run: git config user.name "Their Name", so changes are attributed.',
    'CLI: .mizan/.local/mizan (run with no arguments for usage).',
    task
      ? `Active task: ${task.id} "${task.title}" (${task.kind}, ${task.mode ?? 'guided'} mode), phase: ${task.phase}${task.blocked ? `, blocked on: ${task.blocked.reason}` : ''}. Continue it with the matching /mizan skill.`
      : 'No active task.',
    recent.length > 0 ? `Recent activity:\n${recent.map((entry) => `- ${formatLogEntryLine(entry)}`).join('\n')}` : null,
    handoffNotes ? `Handoff notes from the last session:\n${handoffNotes}` : null,
    rules ? `Project rules (.mizan/rules.md):\n${rules.slice(0, MAXIMUM_RULES_CHARACTERS)}` : null,
    OPERATING_RULES,
  ];
  addContextForClaude('SessionStart', sections.filter(Boolean).join('\n\n'));
});

function readHandoffNotes(handoffPath) {
  const content = readTextFile(handoffPath);
  const notesStart = content.indexOf('## Notes from the last session');
  if (notesStart === -1) return null;
  const notes = content.slice(notesStart).split('\n').slice(1).map((line) => line.trimEnd()).filter(Boolean);
  const isPlaceholder = notes.length === 1 && notes[0].startsWith('None yet.');
  return notes.length === 0 || isPlaceholder ? null : notes.slice(0, MAXIMUM_HANDOFF_NOTE_LINES).join('\n');
}
