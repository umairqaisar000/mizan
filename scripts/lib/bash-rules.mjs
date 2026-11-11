import { globToRegExp } from './glob.mjs';

const SECRET_ENV_FILE = /(?:^|\/)\.env(?:\.(?!example$|sample$|template$)[\w-]+)?$/;
const PROGRAMS_THAT_PRINT_FILES = new Set(['cat', 'less', 'more', 'head', 'tail', 'bat', 'grep', 'rg', 'ag', 'awk', 'sed', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'diff', 'nl', 'sort', 'uniq', 'jq']);
const GIT_SUBCOMMANDS_THAT_PRINT_FILES = new Set(['diff', 'show', 'log', 'blame', 'grep', 'add']);
const PROGRAMS_THAT_COPY = new Set(['cp', 'scp', 'rsync', 'mv']);
const DANGEROUS_DELETE_TARGETS = new Set(['/', '/*', '~', '~/', '~/*', '$HOME', '$HOME/', '${HOME}', '.', './', '..', '../', '*', './*']);
const GIT_SUBCOMMANDS_THAT_MODIFY_PATHS = new Set(['checkout', 'restore', 'mv', 'rm']);
const PROGRAMS_THAT_MODIFY_ALL_ARGUMENTS = new Set(['rm', 'mv', 'cp', 'truncate', 'tee', 'touch', 'unlink']);
const PROGRAMS_THAT_MODIFY_IN_PLACE = new Set(['sed', 'perl']);
const COMMAND_PREFIXES = new Set(['sudo', 'command', 'exec', 'time', 'nice', 'nohup']);
const REDIRECT_TARGET = />>?\s*([^\s;&|<>]+)/g;
const COMMAND_SEPARATOR = /&&|\|\||;|\||\n/;

const DEPENDENCY_INSTALLERS = [
  { program: ['npm'], subcommands: ['install', 'i', 'add', 'isntall'], flagsWithValues: ['--registry', '--prefix', '-w', '--workspace'] },
  { program: ['pnpm'], subcommands: ['add', 'install', 'i'], flagsWithValues: ['--filter', '-F', '--registry', '-C', '--dir'] },
  { program: ['yarn'], subcommands: ['add'], flagsWithValues: ['--registry', '--cwd'] },
  { program: ['bun'], subcommands: ['add', 'install', 'i'], flagsWithValues: ['--registry', '--cwd'] },
  { program: ['pip'], subcommands: ['install'], flagsWithValues: ['-r', '--requirement', '-c', '--constraint', '-e', '--editable', '-i', '--index-url', '--target', '-t'] },
  { program: ['pip3'], subcommands: ['install'], flagsWithValues: ['-r', '--requirement', '-c', '--constraint', '-e', '--editable', '-i', '--index-url', '--target', '-t'] },
  { program: ['uv', 'pip'], subcommands: ['install'], flagsWithValues: ['-r', '--requirement', '-c', '--constraint', '-e', '--editable'] },
  { program: ['uv'], subcommands: ['add'], flagsWithValues: ['--group', '--optional'] },
  { program: ['poetry'], subcommands: ['add'], flagsWithValues: ['--group', '-G'] },
  { program: ['pipx'], subcommands: ['install'], flagsWithValues: [] },
  { program: ['cargo'], subcommands: ['add', 'install'], flagsWithValues: ['--features', '-F', '--git', '--path'] },
  { program: ['go'], subcommands: ['get', 'install'], flagsWithValues: [] },
  { program: ['gem'], subcommands: ['install'], flagsWithValues: ['-v', '--version'] },
  { program: ['bundle'], subcommands: ['add'], flagsWithValues: ['--version', '--group'] },
  { program: ['composer'], subcommands: ['require'], flagsWithValues: [] },
  { program: ['brew'], subcommands: ['install'], flagsWithValues: [] },
];

const PATTERN_RULES = [
  {
    decision: 'deny',
    pattern: /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python3?|node|perl|ruby)\b/,
    reason: 'Piping a download straight into a shell runs unreviewed code. Download it, read it, then run it.',
  },
  {
    decision: 'deny',
    pattern: /\bgit\s+(?:commit|push|merge|rebase|am|cherry-pick)\b.*\s--no-verify\b/,
    reason: 'Skipping git hooks with --no-verify bypasses the project safety checks. Fix the failing hook instead.',
  },
  {
    decision: 'deny',
    pattern: /\bchmod\s+(?:-R\s+)?0?777\b/,
    reason: 'World-writable permissions (777) are a security risk. Use the narrowest permission that works.',
  },
  {
    decision: 'deny',
    pattern: /\bgit\s+(?:filter-branch|filter-repo)\b/,
    reason: 'Rewriting repository history erases the audit trail. Ask the user to do this themselves if it is truly needed.',
  },
  {
    decision: 'ask',
    category: 'publish',
    pattern: /\bgit\s+push\b/,
    reason: 'Pushing publishes work to the remote. The user decides when to push.',
  },
  {
    decision: 'ask',
    category: 'publish',
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+publish\b/,
    reason: 'Publishing a package is public and cannot be undone.',
  },
  {
    decision: 'ask',
    category: 'destructive',
    pattern: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f|checkout\s+(?:\S+\s+)?--\s+\.|restore\s+(?:--\S+\s+)*\.(?:\s|$)|stash\s+(?:drop|clear))/,
    reason: 'This discards uncommitted work and cannot be undone.',
  },
  {
    decision: 'ask',
    category: 'destructive',
    pattern: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*(?:;|$|"|'))/i,
    reason: 'This deletes data in a database.',
  },
  {
    decision: 'ask',
    category: 'secrets',
    pattern: /(?:^|[\s;&|(])(?:printenv\b|env\s*(?:$|[;&|)])|set\s*(?:$|[;&|)])|export\s+-p\b)/,
    reason: 'This prints environment variables, which can expose secrets into the conversation.',
  },
  {
    decision: 'ask',
    category: 'mizan-control',
    pattern: /\bmizan\s+task\s+(?:back|clear)\b/,
    reason: 'This moves a Mizan task backwards or clears it, which reopens locked tests or drops the active task. The user decides.',
  },
];

export function classifyBashCommand(command, { deployCommandPatterns, lockedTestPatterns }) {
  const segments = splitIntoSegments(command);

  for (const words of segments) {
    if (isDangerousDelete(words)) {
      return { decision: 'deny', reason: 'Recursive delete of the root, home, parent or whole project directory is never allowed.' };
    }
    if (printsSecretFile(words)) {
      return { decision: 'deny', reason: 'Reading .env files would put secrets into the conversation. Ask the user for the specific non-secret value you need, or read .env.example.' };
    }
    if (copiesSecretFile(words)) {
      return { decision: 'deny', reason: 'Copying a .env file spreads secrets. Copy .env.example instead, or ask the user.' };
    }
  }
  if (pathsModifiedBy(command).some((path) => stripQuotes(path).replace(/^\.\//, '') === '.mizan/log.jsonl')) {
    return { decision: 'deny', reason: 'The audit log is append-only through the Mizan CLI. Use `.mizan/.local/mizan log` instead.' };
  }

  const matchedRule = PATTERN_RULES.find((rule) => rule.decision === 'deny' && rule.pattern.test(command));
  if (matchedRule) return { decision: 'deny', reason: matchedRule.reason };

  if (lockedTestPatterns.length > 0 && modifiesLockedTestFile(command, lockedTestPatterns)) {
    return {
      decision: 'deny-test-lock',
      reason: 'Tests are locked in this phase. If a test is wrong, stop and explain why to the user instead of changing it.',
    };
  }

  const installedPackages = segments.flatMap(packagesInstalledBy);
  if (installedPackages.length > 0) {
    return {
      decision: 'ask',
      category: 'dependency',
      reason: `This installs ${installedPackages.join(', ')}. New dependencies need the user's approval (supply chain risk, licence, size).`,
    };
  }

  const askRule = PATTERN_RULES.find((rule) => rule.decision === 'ask' && rule.pattern.test(command));
  if (askRule) return { decision: 'ask', reason: askRule.reason, category: askRule.category };

  const deployMatchers = deployCommandPatterns.map((source) => new RegExp(`^(?:${source})`, 'i'));
  const isDeploy = segments.some((words) => deployMatchers.some((matcher) => matcher.test(words.join(' '))));
  if (isDeploy) {
    return { decision: 'ask', reason: 'This looks like a deploy or infrastructure change. The user decides when to deploy.', category: 'deploy' };
  }
  return { decision: 'allow', reason: null, category: null };
}

function splitIntoSegments(command) {
  return command
    .split(COMMAND_SEPARATOR)
    .map((segment) => segment.replace(REDIRECT_TARGET, ' ').trim().split(/\s+/).filter(Boolean))
    .map(dropCommandPrefixes)
    .filter((words) => words.length > 0);
}

function dropCommandPrefixes(words) {
  let index = 0;
  while (index < words.length && (COMMAND_PREFIXES.has(words[index]) || /^\w+=/.test(words[index]))) index += 1;
  return words.slice(index);
}

function stripQuotes(word) {
  return word.replace(/^['"]+|['"]+$/g, '');
}

function isDangerousDelete([program, ...rest]) {
  if (program !== 'rm') return false;
  const flags = rest.filter((word) => word.startsWith('-') && word !== '--');
  const isRecursive = flags.some((flag) => flag === '--recursive' || /^-[a-zA-Z]*[rR]/.test(flag));
  const targets = rest.filter((word) => !word.startsWith('-')).map(stripQuotes);
  return isRecursive && targets.some((target) => DANGEROUS_DELETE_TARGETS.has(target));
}

function printsSecretFile([program, subcommand, ...rest]) {
  const isPrinter = PROGRAMS_THAT_PRINT_FILES.has(program);
  const isGitPrinter = program === 'git' && GIT_SUBCOMMANDS_THAT_PRINT_FILES.has(subcommand);
  if (!isPrinter && !isGitPrinter) return false;
  const candidates = isPrinter ? [subcommand, ...rest] : rest;
  return candidates.filter(Boolean).map(stripQuotes).some((word) => SECRET_ENV_FILE.test(word));
}

function copiesSecretFile([program, ...rest]) {
  if (!PROGRAMS_THAT_COPY.has(program)) return false;
  const operands = rest.filter((word) => !word.startsWith('-')).map(stripQuotes);
  const sources = operands.slice(0, -1);
  return sources.some((word) => SECRET_ENV_FILE.test(word));
}

function packagesInstalledBy(words) {
  for (const installer of DEPENDENCY_INSTALLERS) {
    const programLength = installer.program.length;
    const matchesProgram = installer.program.every((part, index) => words[index] === part);
    if (!matchesProgram || !installer.subcommands.includes(words[programLength])) continue;
    const packages = [];
    const remaining = words.slice(programLength + 1);
    for (let index = 0; index < remaining.length; index += 1) {
      const word = remaining[index];
      if (installer.flagsWithValues.includes(word)) {
        index += 1;
        continue;
      }
      if (word.startsWith('-')) continue;
      packages.push(stripQuotes(word));
    }
    const isLocalProjectInstall = packages.every((name) => name === '.' || name === './');
    return isLocalProjectInstall ? [] : packages;
  }
  return [];
}

function modifiesLockedTestFile(command, lockedTestPatterns) {
  const lockedMatchers = lockedTestPatterns.map(globToRegExp);
  return pathsModifiedBy(command).some((path) => {
    const normalized = stripQuotes(path).replace(/^\.\//, '');
    return lockedMatchers.some((matcher) => matcher.test(normalized));
  });
}

export function pathsModifiedBy(command) {
  const modifiedPaths = [];
  for (const segment of command.split(COMMAND_SEPARATOR)) {
    for (const match of segment.matchAll(REDIRECT_TARGET)) {
      if (match[1] !== '/dev/null' && !/^&\d$/.test(match[1])) modifiedPaths.push(match[1]);
    }
    const [program, ...rest] = dropCommandPrefixes(segment.replace(REDIRECT_TARGET, ' ').trim().split(/\s+/).filter(Boolean));
    const operands = rest.filter((word) => !word.startsWith('-'));
    const editsInPlace = PROGRAMS_THAT_MODIFY_IN_PLACE.has(program) && rest.some((word) => /^-i/.test(word));
    if (PROGRAMS_THAT_MODIFY_ALL_ARGUMENTS.has(program) || editsInPlace) {
      modifiedPaths.push(...operands);
    }
    if (program === 'git' && GIT_SUBCOMMANDS_THAT_MODIFY_PATHS.has(operands[0])) {
      modifiedPaths.push(...operands.slice(1));
    }
  }
  return modifiedPaths;
}
