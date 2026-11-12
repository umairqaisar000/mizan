export const TASK_MODES = ['guided', 'auto'];

export const DECISION_CATEGORIES = ['product', 'technical', 'ux', 'data', 'money', 'legal', 'security', 'privacy'];

export const CATEGORIES_THAT_NEED_A_HUMAN = new Set(['security', 'privacy']);

export function resolveTaskMode(requestedMode, config) {
  const mode = typeof requestedMode === 'string' ? requestedMode : config.mode;
  if (!TASK_MODES.includes(mode)) {
    throw new Error(`Unknown mode "${mode}". Use one of: ${TASK_MODES.join(', ')}.`);
  }
  return mode;
}

export function modeFromFlags(flags) {
  if (flags.auto === true && flags.guided === true) {
    throw new Error('Choose either --auto or --guided, not both.');
  }
  if (flags.auto === true) return 'auto';
  if (flags.guided === true) return 'guided';
  return typeof flags.mode === 'string' ? flags.mode : null;
}

export function autoBranchName(taskId) {
  return `mizan/${taskId}`;
}
