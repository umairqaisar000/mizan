export const CONTEXT_SOURCES = ['linear', 'granola', 'gmail'];

export function enabledContextSources(config) {
  return CONTEXT_SOURCES.filter((source) => config.context[source] === true);
}
