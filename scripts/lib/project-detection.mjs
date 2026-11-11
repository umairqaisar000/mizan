import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile } from './json-files.mjs';

const LOCKFILE_TO_PACKAGE_MANAGER = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

const FRAMEWORK_DEPENDENCIES = [
  ['next', 'Next.js', 'http://localhost:3000'],
  ['nuxt', 'Nuxt', 'http://localhost:3000'],
  ['@remix-run/react', 'Remix', 'http://localhost:5173'],
  ['@sveltejs/kit', 'SvelteKit', 'http://localhost:5173'],
  ['astro', 'Astro', 'http://localhost:4321'],
  ['vite', 'Vite', 'http://localhost:5173'],
  ['react-scripts', 'Create React App', 'http://localhost:3000'],
  ['@nestjs/core', 'NestJS', 'http://localhost:3000'],
  ['express', 'Express', 'http://localhost:3000'],
  ['fastify', 'Fastify', 'http://localhost:3000'],
];

const TEST_RUNNER_DEPENDENCIES = ['vitest', 'jest', 'mocha', 'ava', '@playwright/test', 'cypress'];

function detectPackageManager(projectRoot) {
  const match = LOCKFILE_TO_PACKAGE_MANAGER.find(([lockfile]) => existsSync(join(projectRoot, lockfile)));
  return match ? match[1] : 'npm';
}

function scriptCommand(packageManager, scriptName) {
  if (packageManager === 'npm') {
    return scriptName === 'test' ? 'npm test' : `npm run ${scriptName}`;
  }
  return `${packageManager} run ${scriptName}`;
}

function execCommand(packageManager, binaryWithArguments) {
  const prefix = { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' }[packageManager];
  return `${prefix} ${binaryWithArguments}`;
}

function firstScript(scripts, candidates) {
  return candidates.find((name) => typeof scripts[name] === 'string' && !scripts[name].includes('no test specified'));
}

export function detectProject(projectRoot) {
  const packageJson = readJsonFile(join(projectRoot, 'package.json'), null);
  if (!packageJson) {
    return { isJavaScriptProject: false, isEmpty: isDirectoryEffectivelyEmpty(projectRoot) };
  }
  const packageManager = detectPackageManager(projectRoot);
  const scripts = packageJson.scripts ?? {};
  const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const hasDependency = (name) => name in allDependencies;
  const usesTypeScript = existsSync(join(projectRoot, 'tsconfig.json')) || hasDependency('typescript');
  const framework = FRAMEWORK_DEPENDENCIES.find(([dependency]) => hasDependency(dependency)) ?? null;
  const hasPlaywright = hasDependency('@playwright/test') || ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'].some((file) => existsSync(join(projectRoot, file)));
  const hasEslint = hasDependency('eslint');

  const testScript = firstScript(scripts, ['test:unit', 'test']);
  const e2eScript = firstScript(scripts, ['test:e2e', 'e2e', 'playwright']);
  const lintScript = firstScript(scripts, ['lint']);
  const typecheckScript = firstScript(scripts, ['typecheck', 'type-check', 'check-types', 'tsc']);
  const devScript = firstScript(scripts, ['dev', 'start']);

  return {
    isJavaScriptProject: true,
    isEmpty: false,
    name: packageJson.name ?? null,
    packageManager,
    usesTypeScript,
    framework: framework ? framework[1] : null,
    testRunners: TEST_RUNNER_DEPENDENCIES.filter(hasDependency),
    hasPlaywright,
    hasEslint,
    commands: {
      test: testScript ? scriptCommand(packageManager, testScript) : null,
      e2e: e2eScript ? scriptCommand(packageManager, e2eScript) : (hasPlaywright ? execCommand(packageManager, 'playwright test') : null),
      lint: lintScript ? scriptCommand(packageManager, lintScript) : null,
      lintFile: hasEslint ? execCommand(packageManager, 'eslint --quiet {file}') : null,
      typecheck: typecheckScript ? scriptCommand(packageManager, typecheckScript) : (usesTypeScript ? execCommand(packageManager, 'tsc --noEmit') : null),
      dev: devScript ? scriptCommand(packageManager, devScript) : null,
    },
    appUrl: framework ? framework[2] : null,
  };
}

function isDirectoryEffectivelyEmpty(projectRoot) {
  const ignorable = new Set(['.git', '.mizan', '.DS_Store', 'README.md', '.gitignore', 'LICENSE', '.claude']);
  return readdirSync(projectRoot).every((entry) => ignorable.has(entry));
}
