const REGEX_SPECIAL_CHARACTERS = /[.+^${}()|[\]\\]/g;

export function globToRegExp(pattern) {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const character = pattern[index];
    const isDoubleStar = character === '*' && pattern[index + 1] === '*';
    if (isDoubleStar) {
      const isFollowedBySlash = pattern[index + 2] === '/';
      source += isFollowedBySlash ? '(?:.*/)?' : '.*';
      index += isFollowedBySlash ? 3 : 2;
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(REGEX_SPECIAL_CHARACTERS, '\\$&');
    }
    index += 1;
  }
  return new RegExp(`^${source}$`);
}

export function matchesAnyGlob(relativePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(relativePath));
}
