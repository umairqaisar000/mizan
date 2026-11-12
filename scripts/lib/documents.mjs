import { existsSync, readFileSync } from 'node:fs';

export const UNFILLED_MARKER = '(fill in)';

export const REQUIRED_SECTIONS = {
  plan: ['Goal', 'Acceptance criteria', 'Approach', 'Alternatives considered', 'Existing code to reuse', 'Files', 'Tests', 'User experience', 'Security', 'Decisions and questions', 'Approval'],
  changeNote: ['In one sentence', 'What changed', 'Why', 'Where', 'How it works', 'How to check it yourself', 'Security', 'Risks and follow-ups'],
  rca: ['Symptom', 'Reproduction', 'Evidence', 'Timeline', 'Root cause', 'Why it was not caught', 'Fix', 'Prevention'],
  qa: ['Result', 'Flows checked', 'Console and network', 'Layouts checked', 'Accessibility', 'Screenshots'],
  review: ['Result', 'Blocking findings', 'Non-blocking findings', 'Security'],
  context: ['Sources checked', 'What is being asked for', 'Requirements found', 'Decisions already made', 'Open questions and conflicts', 'Sensitive data'],
};

export function parseSections(markdown) {
  const sections = new Map();
  let currentHeading = null;
  const buffer = [];
  const flush = () => {
    if (currentHeading !== null) sections.set(currentHeading, buffer.join('\n').trim());
    buffer.length = 0;
  };
  for (const line of markdown.split('\n')) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      continue;
    }
    if (currentHeading !== null) buffer.push(line);
  }
  flush();
  return sections;
}

export function findDocumentProblems(filePath, documentKind) {
  if (!existsSync(filePath)) {
    return [`${filePath} does not exist yet.`];
  }
  const sections = parseSections(readFileSync(filePath, 'utf8'));
  const problems = [];
  for (const heading of REQUIRED_SECTIONS[documentKind]) {
    const body = sections.get(heading);
    if (body === undefined) {
      problems.push(`Section "## ${heading}" is missing.`);
    } else if (body === '' || body.includes(UNFILLED_MARKER)) {
      problems.push(`Section "## ${heading}" is not filled in.`);
    }
  }
  return problems;
}

export function readResultLine(filePath) {
  if (!existsSync(filePath)) return null;
  const result = parseSections(readFileSync(filePath, 'utf8')).get('Result') ?? '';
  const firstWord = result.split(/\s+/)[0]?.toUpperCase() ?? '';
  return firstWord.replace(/[^A-Z_]/g, '') || null;
}
