import { spawnSync } from 'node:child_process';

const DEFAULT_TAIL_LINES = 40;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function runShellCommand(command, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, tailLines = DEFAULT_TAIL_LINES }) {
  const result = spawnSync('sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: '0' },
  });
  const combinedOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    succeeded: result.status === 0 && !timedOut,
    exitCode: result.status,
    timedOut,
    outputTail: lastLines(combinedOutput, tailLines),
  };
}

export function lastLines(text, count) {
  const lines = text.trimEnd().split('\n');
  return lines.slice(-count).join('\n');
}
