import { writeAutomaticHandoff } from '../commands/handoff.mjs';
import { loadMizanContext } from '../lib/context.mjs';
import { continueWithoutOutput, readHookInput, runHookSafely } from '../lib/hook-io.mjs';
import { recordTaskUsage } from '../lib/task-usage.mjs';

runHookSafely(() => {
  const input = readHookInput();
  const context = loadMizanContext(input.cwd);
  if (context.initialized) {
    try {
      recordTaskUsage(context, input.transcript_path);
    } catch {
      continueWithoutOutput();
    }
    writeAutomaticHandoff(context);
  }
  continueWithoutOutput();
});
