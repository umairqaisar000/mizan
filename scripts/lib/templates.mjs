import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextFile } from './json-files.mjs';
import { findPluginRoot } from './paths.mjs';

export function renderTemplate(templateName, values) {
  const templatePath = join(findPluginRoot(), 'templates', templateName);
  const template = readFileSync(templatePath, 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => (key in values ? String(values[key] ?? 'none') : placeholder));
}

export function writeTemplateIfMissing(targetPath, templateName, values) {
  if (existsSync(targetPath)) return false;
  writeTextFile(targetPath, renderTemplate(templateName, values));
  return true;
}
