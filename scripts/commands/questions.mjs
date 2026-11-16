import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { appendLogEntry } from '../lib/audit-log.mjs';
import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isoDate, isoTimestamp } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { DECISION_CATEGORIES } from '../lib/modes.mjs';
import { findPersonalData } from '../lib/personal-data.mjs';
import { requireActiveTask, saveTask } from '../lib/tasks.mjs';

export const WAITING_ON_LINEAR = 'linear';

export function runQuestions({ positional, flags }) {
  const [subcommand = 'list', ...rest] = positional;
  const handler = QUESTION_SUBCOMMANDS[subcommand];
  if (!handler) throw new Error(`Unknown questions command "${subcommand}". Use one of: ${Object.keys(QUESTION_SUBCOMMANDS).join(', ')}.`);
  return handler({ arguments: rest, flags, context: requireInitializedContext() });
}

const QUESTION_SUBCOMMANDS = {
  add: ({ arguments: questionWords, flags, context }) => {
    const { paths, config } = context;
    const task = requireTaskThatCanAskOnLinear(context);
    const question = requireValue(questionWords.join(' '), 'the question');
    const category = requireValue(flags.category, `--category (${DECISION_CATEGORIES.join(', ')})`);
    if (!DECISION_CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}". Use one of: ${DECISION_CATEGORIES.join(', ')}.`);
    const options = requireValue(flags.options, '--options (every option, separated by " | ")').split('|').map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) throw new Error('List at least two options with --options "first | second".');
    const recommendation = requireValue(flags.recommend, '--recommend (the option you would pick)');
    if (!options.includes(recommendation)) throw new Error(`--recommend must be one of the options: ${options.join('; ')}.`);
    const why = requireValue(flags.why, '--why (why it matters and why you recommend that option, in one or two sentences)');
    const personalData = findPersonalData([question, why, ...options]);
    if (personalData.length > 0) throw new Error(`This question would post personal data (${personalData.join(', ')}) to Linear. Describe it in general terms instead.`);

    const entry = { id: `Q-${randomBytes(3).toString('hex')}`, question, category, options, recommendation, why, status: 'draft', askedBy: resolveAuthor(paths.projectRoot).name };
    saveTask(paths, { ...task, questions: [...(task.questions ?? []), entry] });
    appendLogEntry(paths, config, { type: 'note', summary: `Drafted question ${entry.id} for Linear: ${question}`, taskId: task.id, ticket: task.ticket });
    return `Question ${entry.id} drafted. Add any others for this checkpoint, post them all in one comment on ${task.ticket}, then run "mizan questions posted --link <comment url>".`;
  },

  posted: ({ flags, context }) => {
    const { paths, config } = context;
    const task = requireTaskThatCanAskOnLinear(context);
    const link = requireValue(flags.link, '--link (the URL of the Linear comment you posted)');
    const drafts = (task.questions ?? []).filter((entry) => entry.status === 'draft');
    if (drafts.length === 0) throw new Error('There are no drafted questions. Add them with "mizan questions add" first.');
    const postedAt = isoTimestamp();
    const questions = task.questions.map((entry) => (entry.status === 'draft' ? { ...entry, status: 'waiting', postedAt, link } : entry));
    const reason = `Waiting for answers on Linear ${task.ticket} to ${drafts.map((entry) => entry.id).join(', ')}`;
    saveTask(paths, { ...task, questions, blocked: { reason, at: postedAt, waitingOn: WAITING_ON_LINEAR } });

    for (const entry of drafts) {
      appendFileSync(paths.decisions, [
        '',
        `### ${isoDate()} | Asked on Linear (${entry.id}, waiting) | ${entry.askedBy} via Claude | ${task.id}`,
        '',
        entry.question,
        '',
        `Options: ${entry.options.join('; ')}`,
        `Recommended: ${entry.recommendation}`,
        `Category: ${entry.category}`,
        `Why it matters: ${entry.why}`,
        `Asked in: ${link}`,
        '',
      ].join('\n'));
      appendLogEntry(paths, config, { type: 'question-asked', summary: `Asked on Linear ${task.ticket}: ${entry.question}`, taskId: task.id, ticket: task.ticket, details: { questionId: entry.id, category: entry.category, options: entry.options, recommendation: entry.recommendation, link } });
    }
    return [
      `Posted ${drafts.length} question(s) on ${task.ticket}. Task ${task.id} is paused until they are answered.`,
      'Tell the user what was asked, then end your turn. To pick the answers up later, they run /mizan:resume, or /loop 30m /mizan:resume to check on a schedule.',
    ].join('\n');
  },

  answer: ({ arguments: [questionId], flags, context }) => {
    const { paths, config } = context;
    const task = requireActiveTask(paths);
    const entry = (task.questions ?? []).find((candidate) => candidate.id === questionId);
    if (!entry) throw new Error(`Task ${task.id} has no question "${questionId ?? ''}". Run "mizan questions" to see them.`);
    if (entry.status !== 'waiting') throw new Error(`Question ${entry.id} is ${entry.status}, not waiting for an answer.`);
    const answeredBy = requireValue(flags.by, '--by (who answered, as shown on Linear)');
    const answer = requireValue(flags.answer, '--answer (what they said, in your own words)');
    const decision = requireValue(flags.decision, '--decision (what you will now do because of it)');
    const link = requireValue(flags.link, '--link (the URL of their Linear comment)');
    const personalData = findPersonalData([answer, decision]);
    if (personalData.length > 0) throw new Error(`The answer contains personal data (${personalData.join(', ')}). Record it in general terms instead.`);

    const answeredAt = isoTimestamp();
    const questions = task.questions.map((candidate) => (candidate.id === entry.id ? { ...candidate, status: 'answered', answeredBy, answer, decision, answeredAt, answerLink: link } : candidate));
    const stillWaiting = questions.filter((candidate) => candidate.status === 'waiting');
    const isWaitingOnLinear = task.blocked?.waitingOn === WAITING_ON_LINEAR;
    const blocked = isWaitingOnLinear && stillWaiting.length === 0 ? null : task.blocked;
    saveTask(paths, { ...task, questions, blocked });

    appendFileSync(paths.decisions, [
      '',
      `### ${isoDate()} | Answered on Linear (${entry.id}) | answered by ${answeredBy} | ${task.id}`,
      '',
      `Question: ${entry.question}`,
      `Answer: ${answer}`,
      `Decision: ${decision}`,
      `Recommended at the time: ${entry.recommendation}`,
      `Answer in: ${link}`,
      `Recorded by: ${resolveAuthor(paths.projectRoot).name} via Claude`,
      '',
    ].join('\n'));
    appendLogEntry(paths, config, { type: 'question-answered', summary: `${answeredBy} answered ${entry.id}: ${answer} -> ${decision}`, taskId: task.id, ticket: task.ticket, details: { questionId: entry.id, answeredBy, answer, decision, link } });
    if (isWaitingOnLinear && blocked === null) {
      appendLogEntry(paths, config, { type: 'task-unblocked', summary: `All Linear questions answered on ${task.ticket}`, taskId: task.id, ticket: task.ticket });
      return `Recorded ${entry.id}. Every question is answered, so task ${task.id} is unblocked. Continue from phase "${task.phase}" with the answers.`;
    }
    return `Recorded ${entry.id}. Still waiting on: ${stillWaiting.map((candidate) => candidate.id).join(', ') || 'none'}.`;
  },

  list: ({ context }) => {
    const task = requireActiveTask(context.paths);
    const questions = task.questions ?? [];
    if (questions.length === 0) return `Task ${task.id} has no Linear questions.`;
    return [
      `Linear questions for ${task.id} (${task.ticket}):`,
      ...questions.map((entry) => `- [${entry.id}] ${entry.status}${entry.postedAt ? ` since ${entry.postedAt}` : ''}: ${entry.question} Options: ${entry.options.join('; ')}. Recommended: ${entry.recommendation}.${entry.answer ? ` Answer from ${entry.answeredBy}: ${entry.answer}. Decision: ${entry.decision}.` : ''}`),
      `Who may answer: ${answererRule(context.config)}`,
    ].join('\n');
  },
};

export function answererRule(config) {
  const names = config.linear.answerers ?? [];
  return names.length > 0 ? `only ${names.join(', ')}` : "only the ticket's assignee or creator";
}

function requireTaskThatCanAskOnLinear({ paths, config }) {
  if (!config.linear.askQuestions) {
    throw new Error('Asking on Linear is off for this project. Turn on "linear": { "askQuestions": true } in .mizan/config.json with the user\'s approval, or ask the user here.');
  }
  const task = requireActiveTask(paths);
  if (!task.ticket) throw new Error(`Task ${task.id} has no ticket, so there is nowhere to ask. Ask the user here instead.`);
  return task;
}
