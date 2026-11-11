import { execFileSync } from 'node:child_process';

function runGit(projectRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

export function readGitConfigValue(projectRoot, key) {
  return runGit(projectRoot, ['config', '--get', key]);
}

export function currentBranch(projectRoot) {
  return runGit(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export function currentCommit(projectRoot) {
  return runGit(projectRoot, ['rev-parse', '--short', 'HEAD']);
}

export function changedFilesSince(projectRoot, baseRef) {
  const output = runGit(projectRoot, ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

export function fileContentAtRef(projectRoot, ref, relativePath) {
  return runGit(projectRoot, ['show', `${ref}:${relativePath}`]) ?? '';
}
