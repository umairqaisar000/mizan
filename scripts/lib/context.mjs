import { DEFAULT_CONFIG, loadConfig, policyFor } from './config.mjs';
import { buildMizanPaths, findProjectRoot, isMizanInitialized } from './paths.mjs';

export function loadMizanContext(startDirectory) {
  const paths = buildMizanPaths(findProjectRoot(startDirectory));
  if (!isMizanInitialized(paths)) {
    return { paths, initialized: false, config: null, policy: null, configError: null };
  }
  try {
    const config = loadConfig(paths);
    return { paths, initialized: true, config, policy: policyFor(config), configError: null };
  } catch (error) {
    return { paths, initialized: true, config: DEFAULT_CONFIG, policy: policyFor(DEFAULT_CONFIG), configError: error.message };
  }
}

export function requireInitializedContext(startDirectory) {
  const context = loadMizanContext(startDirectory);
  if (!context.initialized) {
    throw new Error('Mizan is not set up in this project. Run /mizan:init first.');
  }
  if (context.configError) {
    throw new Error(`.mizan/config.json cannot be used: ${context.configError} Fix the file, then try again.`);
  }
  return context;
}
