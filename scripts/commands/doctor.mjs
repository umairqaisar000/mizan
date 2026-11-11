import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMizanContext } from '../lib/context.mjs';
import { isAuthorKnown, resolveAuthor } from '../lib/identity.mjs';

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
  }

  for (const tool of OPTIONAL_TOOLS) {
    record(isBinaryAvailable(tool.binary), `${tool.binary} (${tool.purpose})`, `Optional: ${tool.install}`);
  }

  const lines = results.map(({ ok, label, advice }) => `${ok ? 'OK  ' : 'FIX '} ${label}${!ok && advice ? `\n      ${advice}` : ''}`);
  lines.push('', 'Browser QA uses the Chrome DevTools MCP server bundled with the plugin. Run /mcp to confirm it is connected.');
  return lines.join('\n');
}

function isBinaryAvailable(binary) {
  return spawnSync('sh', ['-c', `command -v ${binary}`], { stdio: 'ignore' }).status === 0;
}

function fileContains(filePath, text) {
  return existsSync(filePath) && readFileSync(filePath, 'utf8').includes(text);
}
