import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRACKERS, isTrackerUsed } from '../lib/config.mjs';
import { loadMizanContext } from '../lib/context.mjs';
import { isAuthorKnown, resolveAuthor } from '../lib/identity.mjs';
import { rulesNeedingReview } from './rules.mjs';
import { recurringCauses } from './causes.mjs';

const MINIMUM_NODE_MAJOR_VERSION = 18;

const OPTIONAL_TOOLS = [
  { binary: 'gitleaks', purpose: 'deep secret scanning (also runs in CI)', install: 'brew install gitleaks' },
  { binary: 'semgrep', purpose: 'static security analysis', install: 'brew install semgrep' },
  { binary: 'osv-scanner', purpose: 'known-vulnerability check for dependencies', install: 'brew install osv-scanner' },
  { binary: 'gh', purpose: 'creating pull requests from change notes', install: 'brew install gh' },
];

export function runDoctor() {
  const { paths, initialized, config } = loadMizanContext();
  const results = [];
  const record = (ok, label, advice = null) => results.push({ ok, label, advice });
  const claudeChecks = [];
  const reviews = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  record(nodeMajor >= MINIMUM_NODE_MAJOR_VERSION, `Node ${process.versions.node}`, `Mizan needs Node ${MINIMUM_NODE_MAJOR_VERSION} or newer.`);
  record(isBinaryAvailable('git'), 'git installed', 'Install git.');
  const author = resolveAuthor(paths.projectRoot);
  record(isAuthorKnown(author), `Author for the log: ${author.name}`, 'Run: git config user.name "Your Name" so every change is attributed.');
  record(initialized, 'Mizan set up in this project', 'Run /mizan:init.');

  if (initialized) {
    for (const [name, command] of Object.entries(config.commands)) {
      const isRequired = name === 'test';
      if (command) record(true, `commands.${name}: ${command}`);
      else record(!isRequired, `commands.${name} is not set`, isRequired ? 'Set commands.test in .mizan/config.json. Mizan cannot gate work without it.' : null);
    }
    record(Boolean(config.appUrl), `appUrl: ${config.appUrl ?? 'not set'}`, 'Set appUrl so browser QA knows where the app runs.');
    record(fileContains(join(paths.projectRoot, '.gitignore'), '.mizan/.local/'), '.mizan/.local/ is git-ignored', 'Run /mizan:init again to add it.');
    record(fileContains(join(paths.projectRoot, '.gitattributes'), '.mizan/log.jsonl merge=union'), 'Log merges cleanly across branches', 'Run /mizan:init again to add the .gitattributes line.');
    record(existsSync(join(paths.projectRoot, '.github', 'workflows', 'mizan.yml')), 'CI workflow present', 'Optional: run "mizan init --ci" to enforce the same checks in GitHub Actions.');
    const hasPlaywright = existsSync(join(paths.projectRoot, 'node_modules', '@playwright', 'test'));
    record(hasPlaywright, 'Playwright installed', 'Optional but recommended for end-to-end tests: ask before adding @playwright/test.');
    if (isTrackerUsed(config)) checkTrackerConnection(TRACKERS[config.tracker.name], record, claudeChecks);
    for (const { rule, reasons } of rulesNeedingReview(paths)) {
      reviews.push(`Rule ${rule.id} "${rule.text}": ${reasons.join('; ')}. Ask the user whether to keep, revise or retire it.`);
    }
    for (const [label, entries] of recurringCauses(paths)) {
      reviews.push(`Root cause "${label}" has come up ${entries.length} times (${entries.map((entry) => entry.taskId).join(', ')}). Consider a rule, a shared helper or a test that prevents this kind of bug.`);
    }
  }

  for (const tool of OPTIONAL_TOOLS) {
    record(isBinaryAvailable(tool.binary), `${tool.binary} (${tool.purpose})`, `Optional: ${tool.install}`);
  }

  const lines = results.map(({ ok, label, advice }) => `${ok ? 'OK  ' : 'FIX '} ${label}${!ok && advice ? `\n      ${advice}` : ''}`);
  lines.push('', 'Browser QA uses the Chrome DevTools MCP server bundled with the plugin. Run /mcp to confirm it is connected.');
  lines.push(...claudeChecks.map((check) => `CHECK ${check}`));
  lines.push(...reviews.map((review) => `REVIEW ${review}`));
  return lines.join('\n');
}

function checkTrackerConnection(tracker, record, claudeChecks) {
  if (tracker.cli) {
    const installed = isBinaryAvailable(tracker.cli);
    record(installed, `${tracker.cli} installed for ${tracker.label}`, `Install ${tracker.cli} (brew install ${tracker.cli}). Ask the user first.`);
    if (installed) {
      const signedIn = spawnSync(tracker.cli, ['auth', 'status'], { stdio: 'ignore', timeout: 15000 }).status === 0;
      record(signedIn, `${tracker.cli} signed in for ${tracker.label}`, `The user runs "! ${tracker.login}" in Claude Code and signs in through the browser. No API key is needed.`);
    }
    return;
  }
  claudeChecks.push(tracker.connector
    ? `${tracker.label} is reached through the ${tracker.connector} connector, which only Claude can see. Claude: confirm you have ${tracker.connector} tools. If not, the user adds it once: on claude.ai, Settings, Connectors, add ${tracker.connector} and sign in through the browser (no API key), then runs /mcp in Claude Code to confirm it is connected. Their workspace admin may need to allow it first.`
    : 'The tracker is "other". Claude: confirm you have tools for it. If not, the user adds its connector in claude.ai, Settings, Connectors, or with "claude mcp add".');
}

function isBinaryAvailable(binary) {
  return spawnSync('sh', ['-c', `command -v ${binary}`], { stdio: 'ignore' }).status === 0;
}

function fileContains(filePath, text) {
  return existsSync(filePath) && readFileSync(filePath, 'utf8').includes(text);
}
