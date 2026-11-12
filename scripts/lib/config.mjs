import { readJsonFile } from './json-files.mjs';
import { TASK_MODES } from './modes.mjs';

export const STRICTNESS_LEVELS = ['light', 'standard', 'strict'];

const POLICY_BY_STRICTNESS = {
  light: {
    outOfScopeEdit: 'off',
    addedComment: 'warn',
    lockedTestEdit: 'warn',
    editWithoutTask: 'log',
    stopGate: false,
    changeNoteRequired: false,
    newDependency: 'allow',
    requireFailingTestsFirst: false,
  },
  standard: {
    outOfScopeEdit: 'warn',
    addedComment: 'deny',
    lockedTestEdit: 'deny',
    editWithoutTask: 'log',
    stopGate: true,
    changeNoteRequired: true,
    newDependency: 'ask',
    requireFailingTestsFirst: true,
  },
  strict: {
    outOfScopeEdit: 'deny',
    addedComment: 'deny',
    lockedTestEdit: 'deny',
    editWithoutTask: 'deny',
    stopGate: true,
    changeNoteRequired: true,
    newDependency: 'ask',
    requireFailingTestsFirst: true,
  },
};

export const DEFAULT_CONFIG = {
  version: 1,
  strictness: 'standard',
  mode: 'guided',
  commands: {
    test: null,
    e2e: null,
    lint: null,
    lintFile: null,
    typecheck: null,
    dev: null,
  },
  appUrl: null,
  paths: {
    tests: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      'tests/**',
      'test/**',
      'e2e/**',
      '**/e2e/**',
      'playwright/**',
      'cypress/**',
    ],
    protected: [
      '.env',
      '.env.*',
      '**/.env',
      '**/.env.*',
      '**/*.pem',
      '**/*.key',
      '**/*.p12',
      '**/*.pfx',
      '**/id_rsa*',
      '**/id_ed25519*',
      '.git/**',
      '.mizan/log.jsonl',
    ],
    protectedExceptions: ['**/.env.example', '**/.env.sample', '**/.env.template', '.env.example', '.env.sample', '.env.template'],
    schemaChanges: [
      '**/migrations/**',
      '**/migration/**',
      '**/prisma/schema.prisma',
      '**/schema.sql',
      '**/alembic/**',
      'db/schema.rb',
      '**/drizzle/**',
    ],
    lintFileExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte'],
  },
  log: {
    includeEmail: false,
  },
  linear: {
    enabled: false,
    team: null,
  },
  approvals: {
    deployCommandPatterns: [
      '(?:npm|pnpm|yarn|bun)\\s+run\\s+deploy\\b',
      'make\\s+deploy\\b',
      '(?:sh\\s+|bash\\s+|\\./)\\S*deploy\\S*\\.sh\\b',
      '(?:npx\\s+)?vercel\\b.*--prod',
      '(?:npx\\s+)?netlify\\s+deploy\\b.*--prod',
      'kubectl\\s+(?:apply|delete|rollout|scale|patch)\\b',
      'terraform\\s+(?:apply|destroy)\\b',
      'pulumi\\s+(?:up|destroy)\\b',
      'helm\\s+(?:install|upgrade|uninstall|rollback)\\b',
      'docker\\s+push\\b',
      'fly(?:ctl)?\\s+deploy\\b',
      '(?:npx\\s+)?firebase\\s+deploy\\b',
      '(?:npx\\s+)?(?:serverless|sls)\\s+deploy\\b',
      '(?:npx\\s+)?wrangler\\s+(?:deploy|publish)\\b',
      'gcloud\\s+.*\\bdeploy\\b',
      'aws\\s+(?:ecs\\s+update-service|lambda\\s+update-function-code|cloudformation\\s+deploy|s3\\s+sync)\\b',
      'eb\\s+deploy\\b',
    ],
  },
  comments: {
    allowedDirectivePrefixes: [
      '@ts-expect-error',
      '@ts-ignore',
      '@ts-nocheck',
      '@ts-check',
      'eslint-disable',
      'eslint-enable',
      'prettier-ignore',
      'biome-ignore',
      'istanbul ignore',
      'c8 ignore',
      '@vite-ignore',
      'webpackChunkName',
      '@jsxImportSource',
      '<reference',
      'noqa',
      'type: ignore',
      'pragma',
      '@vitest-environment',
      '@jest-environment',
      '#__PURE__',
      '@__PURE__',
      '#__NO_SIDE_EFFECTS__',
      'go:',
      '+build',
      'syntax=',
      'escape=',
      'check=',
      'shellcheck',
      'yaml-language-server',
      '-*- coding',
      'coding:',
      'coding=',
      'vim:',
      'pylint:',
      'mypy:',
      'pyright:',
      'ruff:',
      'fmt:',
      'isort:',
      'nosec',
      'pragma:',
      '@flow',
      'language=',
      'nolint',
      '#region',
      '#endregion',
    ],
  },
  stopGate: {
    maxRetries: 3,
  },
};

function mergeDeep(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeDeep(base[key], value);
  }
  return merged;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadConfig(paths) {
  let projectConfig;
  try {
    projectConfig = readJsonFile(paths.config, {});
  } catch (error) {
    throw new Error(`.mizan/config.json is not valid JSON (${error.message}).`);
  }
  const config = mergeDeep(DEFAULT_CONFIG, projectConfig);
  if (!TASK_MODES.includes(config.mode)) {
    throw new Error(`Unknown mode "${config.mode}" in .mizan/config.json. Use one of: ${TASK_MODES.join(', ')}.`);
  }
  if (!STRICTNESS_LEVELS.includes(config.strictness)) {
    throw new Error(`Unknown strictness "${config.strictness}" in .mizan/config.json. Use one of: ${STRICTNESS_LEVELS.join(', ')}.`);
  }
  return config;
}

export function policyFor(config) {
  return POLICY_BY_STRICTNESS[config.strictness];
}
