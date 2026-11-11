import { writeAutomaticHandoff } from '../commands/handoff.mjs';
import { loadMizanContext } from '../lib/context.mjs';
import { continueWithoutOutput, readHookInput, runHookSafely } from '../lib/hook-io.mjs';

runHookSafely(() => {
  const input = readHookInput();
  const context = loadMizanContext(input.cwd);
  if (context.initialized) writeAutomaticHandoff(context);
  continueWithoutOutput();
});
