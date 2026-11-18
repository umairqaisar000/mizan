const PRICES_PER_MILLION_TOKENS = [
  { prefix: 'claude-fable-5-2', input: 8, output: 40, cacheRead: 0.2 },
  { prefix: 'claude-mythos-5-2', input: 8, output: 40, cacheRead: 0.2 },
  { prefix: 'claude-fable-5', input: 10, output: 50, cacheRead: 1 },
  { prefix: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2 },
  { prefix: 'claude-opus-5', input: 5, output: 25, cacheRead: 0.5 },
  { prefix: 'claude-opus-4', input: 5, output: 25, cacheRead: 0.5 },
  { prefix: 'claude-sonnet-5-5', input: 2, output: 10, cacheRead: 0.1 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10, cacheRead: 0.2 },
  { prefix: 'claude-sonnet-4', input: 3, output: 15, cacheRead: 0.3 },
  { prefix: 'claude-haiku-5-5', input: 0.1, output: 0.5, cacheRead: 0.01 },
  { prefix: 'claude-haiku-4', input: 1, output: 5, cacheRead: 0.1 },
];

const SHORT_CACHE_WRITE_MULTIPLIER = 1.25;
const LONG_CACHE_WRITE_MULTIPLIER = 2;

export function priceFor(model) {
  return PRICES_PER_MILLION_TOKENS.find(({ prefix }) => model.startsWith(prefix)) ?? null;
}

export function estimateCostUsd(model, tokens) {
  const price = priceFor(model);
  if (!price) return null;
  const perToken = (perMillion) => perMillion / 1_000_000;
  return tokens.input * perToken(price.input)
    + tokens.output * perToken(price.output)
    + tokens.cacheRead * perToken(price.cacheRead)
    + tokens.cacheWriteShort * perToken(price.input * SHORT_CACHE_WRITE_MULTIPLIER)
    + tokens.cacheWriteLong * perToken(price.input * LONG_CACHE_WRITE_MULTIPLIER);
}
