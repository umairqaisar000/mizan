import { readFileSync } from 'node:fs';

const EXIT_CODE_BLOCK = 2;
const EXIT_CODE_NON_BLOCKING_ERROR = 1;

export function readHookInput() {
  const raw = readFileSync(0, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

export function blockWithFeedback(message) {
  process.stderr.write(`Mizan: ${message}\n`);
  process.exit(EXIT_CODE_BLOCK);
}

export function askUserToConfirm(hookEventName, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'ask',
      permissionDecisionReason: `Mizan: ${reason}`,
    },
  }));
  process.exit(0);
}

export function addContextForClaude(hookEventName, text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName,
      additionalContext: text,
    },
  }));
  process.exit(0);
}

export function continueWithoutOutput() {
  process.exit(0);
}

export function runHookSafely(handler, { failClosed = false } = {}) {
  try {
    handler();
  } catch (error) {
    if (failClosed) {
      process.stderr.write(`Mizan: a safety check could not run (${error.message}), so this action was blocked to be safe. Ask the user to fix the cause, or to disable the Mizan plugin if it is a Mizan bug.\n`);
      process.exit(EXIT_CODE_BLOCK);
    }
    process.stderr.write(`Mizan hook error (the action was not blocked): ${error.message}\n`);
    process.exit(EXIT_CODE_NON_BLOCKING_ERROR);
  }
}
