import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIZAN_DIR_NAME = '.mizan';

export function findProjectRoot(startDirectory = process.cwd()) {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return startDirectory;
  }
}

export function findPluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), '..', '..');
}

export function buildMizanPaths(projectRoot) {
  const base = join(projectRoot, MIZAN_DIR_NAME);
  const local = join(base, '.local');
  return {
    projectRoot,
    base,
    config: join(base, 'config.json'),
    profile: join(base, 'project.md'),
    rules: join(base, 'rules.md'),
    decisions: join(base, 'decisions.md'),
    log: join(base, 'log.jsonl'),
    changes: join(base, 'changes'),
    rca: join(base, 'rca'),
    tasks: join(base, 'tasks'),
    handoff: join(base, 'handoff.md'),
    local,
    activeTask: join(local, 'active.json'),
    adHocEdits: join(local, 'ad-hoc.json'),
    session: join(local, 'session.json'),
    pendingWarnings: join(local, 'warnings.json'),
    cliShim: join(local, 'mizan'),
    standardsLink: join(local, 'standards'),
  };
}

export function isMizanInitialized(paths) {
  return existsSync(paths.config);
}

export function toProjectRelative(projectRoot, filePath) {
  const absolute = resolve(projectRoot, filePath);
  return relative(projectRoot, absolute).split(sep).join('/');
}

export function isOutsideProject(relativePath) {
  return relativePath.startsWith('../') || relativePath === '..';
}

export function isInsideMizanDirectory(relativePath) {
  return relativePath === MIZAN_DIR_NAME || relativePath.startsWith(`${MIZAN_DIR_NAME}/`);
}
