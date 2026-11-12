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

export function isGitRepository(projectRoot) {
  return runGit(projectRoot, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

export function branchExists(projectRoot, branchName) {
  return runGit(projectRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`]) !== null;
}

export function createAndSwitchToBranch(projectRoot, branchName) {
  return runGit(projectRoot, ['switch', '-c', branchName]) !== null;
}
