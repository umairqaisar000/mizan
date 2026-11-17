import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { appendLogEntry } from '../lib/audit-log.mjs';
import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isoDate, isoTimestamp } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { findPersonalData } from '../lib/personal-data.mjs';
import { loadActiveTask, requireActiveTask, saveTask } from '../lib/tasks.mjs';

export function personalLearningFile() {
  return join(process.env.MIZAN_HOME ?? join(homedir(), '.mizan'), 'learning.md');
}

export function runUnderstood({ positional, flags }) {
  const { paths, config } = requireInitializedContext();
  const task = requireActiveTask(paths);
  const skipped = flags.skipped === true;
  const summary = requireValue(positional.join(' '), skipped
    ? 'reason the check was skipped'
    : 'what the person explained back, and anything that was corrected');
  const personalData = findPersonalData([summary]);
  if (personalData.length > 0) throw new Error(`The summary contains personal data (${personalData.join(', ')}). Describe it in general terms.`);
  const author = resolveAuthor(paths.projectRoot);
  const understanding = { outcome: skipped ? 'skipped' : 'understood', by: author.name, at: isoTimestamp(), summary };
  saveTask(paths, { ...task, understanding });
  appendLogEntry(paths, config, {
    type: 'understanding-checked',
    summary: skipped ? `${author.name} skipped the teach-back check: ${summary}` : `${author.name} explained the change back: ${summary}`,
    taskId: task.id,
    ticket: task.ticket,
    details: { outcome: understanding.outcome },
  });
  return skipped
    ? `Recorded that ${author.name} skipped the teach-back check for ${task.id}.`
    : `Recorded that ${author.name} understood ${task.id}.`;
}

export function runConcepts({ positional, flags }) {
  const [subcommand = 'list', ...termWords] = positional;
  const learningFile = personalLearningFile();
  const known = readKnownConcepts(learningFile);

  if (subcommand === 'list') {
    return known.length > 0 ? `Concepts already explained to you (${learningFile}):\n${known.join(', ')}` : `No concepts recorded yet in ${learningFile}.`;
  }
  if (subcommand !== 'add') throw new Error('Use "mizan concepts", or "mizan concepts add <term> --explain <two plain sentences>".');

  const term = requireValue(termWords.join(' '), 'the concept, for example "race condition"');
  const explanation = requireValue(flags.explain, '--explain (two plain sentences, with an example from this task)');
  if (known.some((existing) => existing.toLowerCase() === term.toLowerCase())) return `"${term}" is already in your learning notes, so it was not added again.`;
  const personalData = findPersonalData([term, explanation]);
  if (personalData.length > 0) throw new Error(`The explanation contains personal data (${personalData.join(', ')}). Use a general example.`);

  const { paths } = requireInitializedContext();
  const task = loadActiveTask(paths);
  mkdirSync(dirname(learningFile), { recursive: true });
  if (!existsSync(learningFile)) appendFileSync(learningFile, '# What I learned\n\nConcepts explained during Mizan tasks. Only on this computer.\n');
  appendFileSync(learningFile, `\n## ${term}\n\n${explanation}\n\nLearned ${isoDate()}${task ? ` in ${task.id}` : ''}.\n`);
  return `Added "${term}" to your learning notes (${learningFile}).`;
}

function readKnownConcepts(learningFile) {
  if (!existsSync(learningFile)) return [];
  return readFileSync(learningFile, 'utf8').split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3).trim());
}
