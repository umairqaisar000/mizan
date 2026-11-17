export const CONTEXT_SOURCES = ['tracker', 'granola', 'gmail'];

export function enabledContextSources(config) {
  return CONTEXT_SOURCES
    .filter((source) => config.context[source] === true)
    .map((source) => (source === 'tracker' ? config.tracker.name : source));
}
