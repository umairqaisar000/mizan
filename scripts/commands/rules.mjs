import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { appendLogEntry, readAllLogEntries } from '../lib/audit-log.mjs';
import { requireValue } from '../lib/arguments.mjs';
import { requireInitializedContext } from '../lib/context.mjs';
import { isoDate } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { readJsonFileOrFallback, writeJsonFile } from '../lib/json-files.mjs';
import { findPersonalData } from '../lib/personal-data.mjs';
import { loadActiveTask } from '../lib/tasks.mjs';

const DAYS_BEFORE_AN_UNUSED_RULE_IS_FLAGGED = 60;
const RULE_EVENTS = { held: 'held', recurred: 'recurred' };

export function loadRules(paths) {
  return readJsonFileOrFallback(paths.rulesIndex, { rules: [] }).rules;
}

export function currentModel(paths) {
  const costs = readAllLogEntries(paths).filter((entry) => entry.type === 'task-cost' && entry.details?.byModel);
  const latest = costs.at(-1) ?? null;
  const byModel = latest?.details.byModel ?? loadActiveTask(paths)?.usage?.byModel ?? null;
  if (!byModel) return null;
  const tokensOf = (value) => Object.values(value.tokens ?? value).reduce((sum, count) => sum + count, 0);
  return Object.entries(byModel).sort(([, left], [, right]) => tokensOf(right) - tokensOf(left))[0]?.[0] ?? null;
}

export function rulesNeedingReview(paths, today = new Date()) {
  const model = currentModel(paths);
  return loadRules(paths).filter((rule) => rule.status === 'active').flatMap((rule) => {
    const reasons = [];
    const recurrences = rule.events.filter((event) => event.kind === RULE_EVENTS.recurred);
    const helds = rule.events.filter((event) => event.kind === RULE_EVENTS.held);
    if (recurrences.length > 0) reasons.push(`the problem came back ${recurrences.length} time(s) despite it`);
    if (model && rule.model && rule.model !== model) reasons.push(`it was learned with ${rule.model} and the team now mostly uses ${model}`);
    const ageInDays = (today - new Date(rule.addedOn)) / 86_400_000;
    if (helds.length === 0 && ageInDays > DAYS_BEFORE_AN_UNUSED_RULE_IS_FLAGGED) reasons.push(`there is no record of it preventing anything in ${Math.floor(ageInDays)} days`);
    return reasons.length > 0 ? [{ rule, reasons }] : [];
  });
}

export function runRule({ positional, flags }) {
  const [subcommand = 'list', ...rest] = positional;
  const handler = RULE_SUBCOMMANDS[subcommand];
  if (!handler) throw new Error(`Unknown rule command "${subcommand}". Use one of: ${Object.keys(RULE_SUBCOMMANDS).join(', ')}.`);
  return handler({ arguments: rest, flags, context: requireInitializedContext() });
}

const RULE_SUBCOMMANDS = {
  add: ({ arguments: ruleWords, flags, context }) => {
    const { paths, config } = context;
    const text = requireValue(ruleWords.join(' '), 'rule text');
    const why = requireValue(flags.why, '--why (the problem this rule prevents, in one sentence)');
    rejectPersonalData([text, why]);
    const task = loadActiveTask(paths);
    const rule = {
      id: `R-${randomBytes(3).toString('hex')}`,
      text,
      why,
      fromTask: typeof flags.from === 'string' ? flags.from : task?.id ?? null,
      model: currentModel(paths),
      addedOn: isoDate(),
      addedBy: resolveAuthor(paths.projectRoot).name,
      status: 'active',
      events: [],
    };
    writeJsonFile(paths.rulesIndex, { rules: [...loadRules(paths), rule] });
    appendFileSync(paths.rules, `- [${rule.id}] ${text} Why: ${why} (added ${rule.addedOn} by ${rule.addedBy})\n`);
    appendLogEntry(paths, config, { type: 'rule-added', summary: `New project rule ${rule.id}: ${text}`, taskId: rule.fromTask, details: { ruleId: rule.id, why, model: rule.model } });
    return `Rule ${rule.id} added to .mizan/rules.md. It is loaded at the start of every session.`;
  },

  held: ({ arguments: [ruleId, ...noteWords], context }) => recordEvent(context, ruleId, RULE_EVENTS.held, noteWords),

  recurred: ({ arguments: [ruleId, ...noteWords], context }) => recordEvent(context, ruleId, RULE_EVENTS.recurred, noteWords),

  retire: ({ arguments: [ruleId, ...reasonWords], context }) => {
    const { paths, config } = context;
    const reason = requireValue(reasonWords.join(' '), 'reason the rule is retired');
    const rule = findActiveRule(paths, ruleId);
    const author = resolveAuthor(paths.projectRoot).name;
    saveRule(paths, { ...rule, status: 'retired', retiredOn: isoDate(), retiredBy: author, retiredReason: reason });
    removeRuleLine(paths, rule.id);
    appendLogEntry(paths, config, { type: 'rule-retired', summary: `Retired rule ${rule.id}: ${rule.text} (${reason})`, details: { ruleId: rule.id, reason } });
    return `Rule ${rule.id} retired and removed from .mizan/rules.md. Its history stays in .mizan/rules.json.`;
  },

  list: ({ context }) => {
    const { paths } = context;
    const rules = loadRules(paths);
    if (rules.length === 0) return 'No rules recorded with reasons yet. Older rules in .mizan/rules.md have no track record.';
    const review = new Map(rulesNeedingReview(paths).map(({ rule, reasons }) => [rule.id, reasons]));
    return rules.map((rule) => {
      const held = rule.events.filter((event) => event.kind === RULE_EVENTS.held).length;
      const recurred = rule.events.filter((event) => event.kind === RULE_EVENTS.recurred).length;
      const flag = review.has(rule.id) ? `\n    Review: ${review.get(rule.id).join('; ')}.` : '';
      return `- [${rule.id}] ${rule.status}: ${rule.text}\n    Why: ${rule.why}. Prevented: ${held}. Came back: ${recurred}. Learned ${rule.addedOn} by ${rule.addedBy}${rule.model ? ` with ${rule.model}` : ''}.${flag}`;
    }).join('\n');
  },
};

function recordEvent({ paths, config }, ruleId, kind, noteWords) {
  const note = requireValue(noteWords.join(' '), kind === RULE_EVENTS.held ? 'what the rule prevented' : 'how the problem came back');
  rejectPersonalData([note]);
  const rule = findActiveRule(paths, ruleId);
  const task = loadActiveTask(paths);
  saveRule(paths, { ...rule, events: [...rule.events, { kind, note, on: isoDate(), taskId: task?.id ?? null, by: resolveAuthor(paths.projectRoot).name }] });
  appendLogEntry(paths, config, {
    type: 'rule-checked',
    summary: kind === RULE_EVENTS.held ? `Rule ${rule.id} prevented a problem: ${note}` : `The problem behind rule ${rule.id} came back: ${note}`,
    taskId: task?.id ?? null,
    details: { ruleId: rule.id, kind },
  });
  return kind === RULE_EVENTS.held
    ? `Recorded that rule ${rule.id} prevented a problem.`
    : `Recorded that the problem behind rule ${rule.id} came back. Consider revising the rule with the user.`;
}

function findActiveRule(paths, ruleId) {
  const rule = loadRules(paths).find((candidate) => candidate.id === ruleId);
  if (!rule) throw new Error(`No rule "${ruleId ?? ''}". Run "mizan rule list" to see them.`);
  if (rule.status !== 'active') throw new Error(`Rule ${rule.id} is ${rule.status}.`);
  return rule;
}

function saveRule(paths, updated) {
  writeJsonFile(paths.rulesIndex, { rules: loadRules(paths).map((rule) => (rule.id === updated.id ? updated : rule)) });
}

function removeRuleLine(paths, ruleId) {
  if (!existsSync(paths.rules)) return;
  const kept = readFileSync(paths.rules, 'utf8').split('\n').filter((line) => !line.startsWith(`- [${ruleId}]`));
  writeFileSync(paths.rules, kept.join('\n'));
}

function rejectPersonalData(texts) {
  const found = findPersonalData(texts);
  if (found.length > 0) throw new Error(`This contains personal data (${found.join(', ')}). Describe it in general terms.`);
}
