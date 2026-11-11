import { extname } from 'node:path';
import { matchesAnyGlob } from './glob.mjs';

const MIZAN_CONTROL_FILES = ['.mizan/config.json', '.mizan/tasks/*/state.json', '.mizan/.local/**'];

export function isTestFile(relativePath, config) {
  return matchesAnyGlob(relativePath, config.paths.tests);
}

export function isProtectedFile(relativePath, config) {
  const isException = matchesAnyGlob(relativePath, config.paths.protectedExceptions);
  return !isException && matchesAnyGlob(relativePath, config.paths.protected);
}

export function isSecretBearingFile(relativePath, config) {
  return isProtectedFile(relativePath, config) && relativePath !== '.mizan/log.jsonl' && !relativePath.startsWith('.git/');
}

export function isMizanControlFile(relativePath) {
  return matchesAnyGlob(relativePath, MIZAN_CONTROL_FILES);
}

export function shouldLintSingleFile(relativePath, config) {
  return config.paths.lintFileExtensions.includes(extname(relativePath));
}
