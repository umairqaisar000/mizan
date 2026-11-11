export function parseArguments(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const [rawName, inlineValue] = token.slice(2).split(/=(.*)/s);
    const nextToken = argv[index + 1];
    if (inlineValue !== undefined) {
      flags[rawName] = inlineValue;
    } else if (nextToken !== undefined && !nextToken.startsWith('--')) {
      flags[rawName] = nextToken;
      index += 1;
    } else {
      flags[rawName] = true;
    }
  }
  return { positional, flags };
}

export function requireValue(value, description) {
  if (value === undefined || value === true || value === '') {
    throw new Error(`Missing ${description}.`);
  }
  return value;
}
