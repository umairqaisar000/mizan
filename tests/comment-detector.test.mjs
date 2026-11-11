import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../scripts/lib/config.mjs';
import { findAddedComments } from '../scripts/lib/comment-detector.mjs';

const allowedDirectivePrefixes = DEFAULT_CONFIG.comments.allowedDirectivePrefixes;

function added(filePath, previousContent, nextContent) {
  return findAddedComments({ filePath, previousContent, nextContent, allowedDirectivePrefixes });
}

test('flags a new line comment in TypeScript', () => {
  assert.deepEqual(added('src/a.ts', 'const a = 1;\n', 'const a = 1;\n// explain a\n'), ['explain a']);
});

test('flags a new block comment and a JSX comment', () => {
  const next = 'const view = (\n  <div>{/* hidden */}</div>\n);\n/** docs */\n';
  assert.deepEqual(added('src/view.tsx', '', next), ['hidden', 'docs']);
});

test('ignores comment-like text inside strings, templates and regexes', () => {
  const next = [
    'const url = "https://example.com/path";',
    "const single = '// not a comment';",
    'const template = `/* not ${"a // comment"} either */`;',
    'const pattern = /\\/\\/+/g;',
    'const divided = total / count / 2;',
  ].join('\n');
  assert.deepEqual(added('src/strings.ts', '', next), []);
});

test('does not flag comments that already existed', () => {
  const previous = '// legacy note\nconst a = 1;\n';
  const next = '// legacy note\nconst a = 2;\n';
  assert.deepEqual(added('src/a.ts', previous, next), []);
});

test('allows tooling directives', () => {
  const next = '// @ts-expect-error broken upstream type\n/* eslint-disable no-console */\n';
  assert.deepEqual(added('src/a.ts', '', next), []);
});

test('flags hash comments in Python and YAML but not the shebang or quoted hashes', () => {
  assert.deepEqual(added('tool.py', '', '#!/usr/bin/env python3\nname = "#tag"\n# explain\n'), ['explain']);
  assert.deepEqual(added('ci.yml', '', 'on: push\n# why\n'), ['why']);
});

test('flags HTML comments in markup files', () => {
  assert.deepEqual(added('index.html', '', '<main><!-- note --></main>\n'), ['note']);
});

test('ignores file types without code comments', () => {
  assert.deepEqual(added('README.md', '', '<!-- anything -->\n'), []);
  assert.deepEqual(added('data.json', '', '{"a": "// b"}\n'), []);
});
