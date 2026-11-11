import { extname } from 'node:path';

const SLASH_STYLE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.java', '.kt', '.kts', '.swift', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.dart', '.scala', '.php',
]);
const HASH_STYLE_EXTENSIONS = new Set(['.py', '.rb', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml', '.r', '.pl', '.ps1']);
const BLOCK_ONLY_EXTENSIONS = new Set(['.css', '.scss', '.less']);
const MARKUP_EXTENSIONS = new Set(['.html', '.htm', '.vue', '.svelte', '.astro']);
const SPECIAL_FILE_NAMES = new Map([['Dockerfile', 'hash'], ['Makefile', 'hash']]);

const REGEX_CAN_FOLLOW = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^']);
const REGEX_CAN_FOLLOW_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

export function commentStyleFor(filePath) {
  const baseName = filePath.split('/').pop();
  if (SPECIAL_FILE_NAMES.has(baseName)) {
    return SPECIAL_FILE_NAMES.get(baseName);
  }
  const extension = extname(filePath).toLowerCase();
  if (SLASH_STYLE_EXTENSIONS.has(extension)) return 'slash';
  if (HASH_STYLE_EXTENSIONS.has(extension)) return 'hash';
  if (BLOCK_ONLY_EXTENSIONS.has(extension)) return 'block';
  if (MARKUP_EXTENSIONS.has(extension)) return 'markup';
  return null;
}

export function extractComments(source, style) {
  if (style === 'slash') return extractSlashComments(source, { allowLineComments: true });
  if (style === 'block') return extractSlashComments(source, { allowLineComments: false });
  if (style === 'hash') return extractHashComments(source);
  if (style === 'markup') return [...extractMarkupComments(source), ...extractSlashComments(stripMarkupComments(source), { allowLineComments: true, markupAware: true })];
  return [];
}

function extractSlashComments(source, { allowLineComments, markupAware = false }) {
  const comments = [];
  let index = 0;
  let previousSignificant = '';
  let previousWord = '';
  const templateDepthStack = [];

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      comments.push(source.slice(index + 2, end === -1 ? source.length : end));
      index = stop;
      continue;
    }
    if (allowLineComments && character === '/' && next === '/' && !isUrlScheme(source, index)) {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      comments.push(source.slice(index + 2, stop));
      index = stop;
      continue;
    }
    if (character === '"' || character === "'") {
      index = skipQuoted(source, index, character);
      previousSignificant = character;
      previousWord = '';
      continue;
    }
    if (character === '`') {
      index = skipTemplate(source, index + 1, templateDepthStack);
      previousSignificant = '`';
      previousWord = '';
      continue;
    }
    if (character === '}' && templateDepthStack.length > 0 && templateDepthStack[templateDepthStack.length - 1] === 0) {
      templateDepthStack.pop();
      index = skipTemplate(source, index + 1, templateDepthStack);
      continue;
    }
    if (templateDepthStack.length > 0) {
      if (character === '{') templateDepthStack[templateDepthStack.length - 1] += 1;
      if (character === '}') templateDepthStack[templateDepthStack.length - 1] -= 1;
    }
    if (character === '/' && !markupAware && looksLikeRegexStart(previousSignificant, previousWord)) {
      index = skipRegex(source, index);
      previousSignificant = '/';
      previousWord = '';
      continue;
    }
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const wordMatch = /^[A-Za-z_$][\w$]*/.exec(source.slice(index, index + 64));
      previousWord = wordMatch[0];
      previousSignificant = 'word';
      index += wordMatch[0].length;
      continue;
    }
    previousSignificant = character;
    previousWord = '';
    index += 1;
  }
  return comments;
}

function isUrlScheme(source, slashIndex) {
  return source[slashIndex - 1] === ':' && /[a-z]$/i.test(source.slice(Math.max(0, slashIndex - 10), slashIndex - 1));
}

function looksLikeRegexStart(previousSignificant, previousWord) {
  if (previousSignificant === '') return true;
  if (previousSignificant === 'word') return REGEX_CAN_FOLLOW_KEYWORDS.has(previousWord);
  return REGEX_CAN_FOLLOW.has(previousSignificant);
}

function skipQuoted(source, startIndex, quote) {
  let index = startIndex + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === quote || character === '\n') {
      return index + 1;
    }
    index += 1;
  }
  return index;
}

function skipTemplate(source, startIndex, templateDepthStack) {
  let index = startIndex;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '`') {
      return index + 1;
    }
    if (character === '$' && source[index + 1] === '{') {
      templateDepthStack.push(0);
      return index + 2;
    }
    index += 1;
  }
  return index;
}

function skipRegex(source, startIndex) {
  let index = startIndex + 1;
  let insideCharacterClass = false;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '\n') {
      return index;
    }
    if (character === '[') insideCharacterClass = true;
    if (character === ']') insideCharacterClass = false;
    if (character === '/' && !insideCharacterClass) {
      index += 1;
      while (/[a-z]/i.test(source[index] ?? '')) index += 1;
      return index;
    }
    index += 1;
  }
  return index;
}

function extractHashComments(source) {
  const comments = [];
  const lines = source.split('\n');
  lines.forEach((line, lineIndex) => {
    const isShebang = lineIndex === 0 && line.startsWith('#!');
    if (isShebang) return;
    const commentStart = findUnquotedHash(line);
    if (commentStart !== -1) {
      comments.push(line.slice(commentStart + 1));
    }
  });
  return comments;
}

function findUnquotedHash(line) {
  let activeQuote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (activeQuote) {
      if (character === activeQuote) activeQuote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      activeQuote = character;
      continue;
    }
    const startsComment = character === '#' && (index === 0 || /\s/.test(line[index - 1]));
    if (startsComment) return index;
  }
  return -1;
}

function extractMarkupComments(source) {
  return [...source.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
}

function stripMarkupComments(source) {
  const scriptBlocks = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const styleBlocks = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  return [...scriptBlocks, ...styleBlocks].join('\n');
}

function normalizeComment(text) {
  return text.replace(/^[*\s]+|[*\s]+$/g, '').replace(/\s+/g, ' ');
}

function isAllowedDirective(normalizedText, allowedPrefixes) {
  return allowedPrefixes.some((prefix) => normalizedText.startsWith(prefix));
}

export function findAddedComments({ filePath, previousContent, nextContent, allowedDirectivePrefixes }) {
  const style = commentStyleFor(filePath);
  if (!style) return [];
  const countByText = new Map();
  for (const comment of extractComments(previousContent, style)) {
    const key = normalizeComment(comment);
    countByText.set(key, (countByText.get(key) ?? 0) + 1);
  }
  const added = [];
  for (const comment of extractComments(nextContent, style)) {
    const key = normalizeComment(comment);
    const remaining = countByText.get(key) ?? 0;
    if (remaining > 0) {
      countByText.set(key, remaining - 1);
      continue;
    }
    if (key === '' || isAllowedDirective(key, allowedDirectivePrefixes)) continue;
    added.push(key);
  }
  return added;
}
