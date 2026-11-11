import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendLogEntry } from '../lib/audit-log.mjs';
import { DEFAULT_CONFIG, STRICTNESS_LEVELS, loadConfig } from '../lib/config.mjs';
import { isoDate } from '../lib/dates.mjs';
import { resolveAuthor } from '../lib/identity.mjs';
import { readJsonFile, writeJsonFile, writeTextFile } from '../lib/json-files.mjs';
import { buildMizanPaths, findPluginRoot, findProjectRoot, isMizanInitialized } from '../lib/paths.mjs';
import { installLocalShortcuts } from '../lib/local-shortcuts.mjs';
import { detectProject } from '../lib/project-detection.mjs';
import { writeTemplateIfMissing } from '../lib/templates.mjs';

const GITIGNORE_LINE = '.mizan/.local/';
const GITATTRIBUTES_LINES = ['.mizan/log.jsonl merge=union', '.mizan/decisions.md merge=union', '.mizan/rules.md merge=union'];

export function runInit({ flags }) {
  const projectRoot = findProjectRoot();
  const paths = buildMizanPaths(projectRoot);
  const strictness = flags.strictness ?? DEFAULT_CONFIG.strictness;
  if (!STRICTNESS_LEVELS.includes(strictness)) {
    throw new Error(`Unknown strictness "${strictness}". Use one of: ${STRICTNESS_LEVELS.join(', ')}.`);
  }
  const wasAlreadyInitialized = isMizanInitialized(paths);
  const detected = detectProject(projectRoot);

  for (const directory of [paths.base, paths.changes, paths.rca, paths.tasks, paths.local]) {
    mkdirSync(directory, { recursive: true });
  }
  if (!wasAlreadyInitialized) {
    writeJsonFile(paths.config, buildInitialConfig(detected, strictness));
  } else if (flags['refresh-commands'] && detected.isJavaScriptProject) {
    const existing = readJsonFile(paths.config, {});
    writeJsonFile(paths.config, { ...existing, commands: detected.commands, appUrl: detected.appUrl });
  }
  const author = resolveAuthor(projectRoot);
  const templateValues = { date: isoDate(), author: author.name, projectName: detected.name ?? 'this project' };
  writeTemplateIfMissing(paths.rules, 'rules.md', templateValues);
  writeTemplateIfMissing(paths.decisions, 'decisions.md', templateValues);
  writeTemplateIfMissing(paths.profile, 'project.md', templateValues);
  if (!existsSync(paths.log)) writeTextFile(paths.log, '');
  installLocalShortcuts(paths);

  ensureLinesInFile(join(projectRoot, '.gitignore'), [GITIGNORE_LINE]);
  ensureLinesInFile(join(projectRoot, '.gitattributes'), GITATTRIBUTES_LINES);
  const installedWorkflow = flags.ci ? installCiWorkflow(projectRoot) : null;

  const config = loadConfig(paths);
  if (!wasAlreadyInitialized) {
    appendLogEntry(paths, config, { type: 'setup', summary: `Mizan set up (strictness: ${strictness})`, files: ['.mizan/config.json'] });
  }

  return [
    wasAlreadyInitialized ? `Mizan was already set up here. Existing files were kept${flags['refresh-commands'] ? ', and the commands were detected again' : ''}.` : 'Mizan is set up in this project.',
    `Author for the log: ${author.name}${author.name === 'unknown' ? ' (set git config user.name so changes are attributed)' : ''}`,
    `Detected: ${describeDetection(detected)}`,
    'Configuration (.mizan/config.json):',
    JSON.stringify({ strictness: config.strictness, commands: config.commands, appUrl: config.appUrl }, null, 2),
    installedWorkflow ? `CI workflow written to ${installedWorkflow}. Set the MIZAN_REPOSITORY variable in GitHub to the repo that hosts Mizan.` : null,
  ].filter(Boolean).join('\n');
}

function buildInitialConfig(detected, strictness) {
  return {
    version: DEFAULT_CONFIG.version,
    strictness,
    commands: detected.isJavaScriptProject ? detected.commands : DEFAULT_CONFIG.commands,
    appUrl: detected.isJavaScriptProject ? detected.appUrl : null,
    log: DEFAULT_CONFIG.log,
    linear: DEFAULT_CONFIG.linear,
  };
}

function describeDetection(detected) {
  if (!detected.isJavaScriptProject) {
    return detected.isEmpty ? 'an empty project (use /mizan:new to start it properly)' : 'no package.json (commands must be filled in by hand)';
  }
  return [
    detected.framework ?? 'no known framework',
    detected.usesTypeScript ? 'TypeScript' : 'JavaScript',
    detected.packageManager,
    detected.testRunners.length > 0 ? `tests: ${detected.testRunners.join(', ')}` : 'no test runner found',
  ].join(', ');
}

function ensureLinesInFile(filePath, lines) {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const existingLines = new Set(existing.split('\n').map((line) => line.trim()));
  const missing = lines.filter((line) => !existingLines.has(line));
  if (missing.length === 0) return;
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  appendFileSync(filePath, `${separator}${missing.join('\n')}\n`);
}

function installCiWorkflow(projectRoot) {
  const target = join(projectRoot, '.github', 'workflows', 'mizan.yml');
  if (existsSync(target)) return null;
  mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
  copyFileSync(join(findPluginRoot(), 'templates', 'github', 'mizan.yml'), target);
  return '.github/workflows/mizan.yml';
}
