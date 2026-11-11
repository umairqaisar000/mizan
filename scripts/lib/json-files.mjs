import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJsonFile(filePath, fallbackValue) {
  if (!existsSync(filePath)) {
    return fallbackValue;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function readJsonFileOrFallback(filePath, fallbackValue) {
  try {
    return readJsonFile(filePath, fallbackValue);
  } catch {
    return fallbackValue;
  }
}

export function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, filePath);
}

export function readTextFile(filePath, fallbackValue = '') {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : fallbackValue;
}

export function writeTextFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}
