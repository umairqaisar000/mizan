import { readGitConfigValue } from './git.mjs';

export const UNKNOWN_AUTHOR_NAME = 'unknown';

export function resolveAuthor(projectRoot) {
  const name = process.env.MIZAN_AUTHOR_NAME || readGitConfigValue(projectRoot, 'user.name');
  const email = process.env.MIZAN_AUTHOR_EMAIL || readGitConfigValue(projectRoot, 'user.email');
  return {
    name: name || UNKNOWN_AUTHOR_NAME,
    email: email || null,
  };
}

export function isAuthorKnown(author) {
  return author.name !== UNKNOWN_AUTHOR_NAME;
}
