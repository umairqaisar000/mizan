import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { requireInitializedContext } from '../lib/context.mjs';
import { UNFILLED_MARKER, parseSections } from '../lib/documents.mjs';

export function readRootCauses(paths) {
  if (!existsSync(paths.rca)) return [];
  return readdirSync(paths.rca).filter((name) => name.endsWith('.md')).map((name) => {
    const sections = parseSections(readFileSync(join(paths.rca, name), 'utf8'));
    const field = (heading) => {
      const value = (sections.get(heading) ?? '').trim();
      return value && !value.includes(UNFILLED_MARKER) ? value : null;
    };
    return {
      taskId: basename(name, '.md'),
      label: field('Root cause label')?.split('\n')[0].replace(/`/g, '').trim().toLowerCase() ?? null,
      symptom: firstSentence(field('Symptom')),
      rootCause: firstSentence(field('Root cause')),
      fix: firstSentence(field('Fix')),
    };
  }).filter((entry) => entry.label || entry.rootCause);
}

export function recurringCauses(paths) {
  const groups = groupByLabel(readRootCauses(paths));
  return [...groups.entries()].filter(([label, entries]) => label !== 'unlabelled' && entries.length > 1);
}

export function runCauses({ positional }) {
  const { paths } = requireInitializedContext();
  const words = positional.map((word) => word.toLowerCase());
  const matches = readRootCauses(paths).filter((entry) => words.length === 0 || words.some((word) => [entry.label, entry.symptom, entry.rootCause].some((text) => text?.toLowerCase().includes(word))));
  if (matches.length === 0) return words.length > 0 ? `No earlier root cause matches "${positional.join(' ')}".` : 'No root cause analyses recorded yet.';
  return [...groupByLabel(matches).entries()].map(([label, entries]) => [
    `${label} (${entries.length} time${entries.length === 1 ? '' : 's'})`,
    ...entries.map((entry) => `  - ${entry.taskId}: ${entry.rootCause ?? 'root cause not written yet'}${entry.fix ? ` Fix: ${entry.fix}` : ''}`),
  ].join('\n')).join('\n');
}

function groupByLabel(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const label = entry.label ?? 'unlabelled';
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return groups;
}

function firstSentence(text) {
  if (!text) return null;
  const sentence = text.replace(/\s+/g, ' ').match(/^.*?[.!?](\s|$)/)?.[0] ?? text.replace(/\s+/g, ' ');
  return sentence.trim().slice(0, 220);
}
