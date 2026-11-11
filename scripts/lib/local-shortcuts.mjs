import { chmodSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextFile } from './json-files.mjs';
import { findPluginRoot } from './paths.mjs';

export function cliEntryPoint() {
  return join(findPluginRoot(), 'scripts', 'mizan.mjs');
}

export function installLocalShortcuts(paths) {
  mkdirSync(paths.local, { recursive: true });
  writeTextFile(paths.cliShim, `#!/bin/sh\nexec node "${cliEntryPoint()}" "$@"\n`);
  chmodSync(paths.cliShim, 0o755);
  writeTextFile(`${paths.cliShim}.cmd`, `@node "${cliEntryPoint()}" %*\r\n`);
  if (pathExists(paths.standardsLink)) rmSync(paths.standardsLink, { recursive: true, force: true });
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(join(findPluginRoot(), 'standards'), paths.standardsLink, linkType);
}

function pathExists(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}
