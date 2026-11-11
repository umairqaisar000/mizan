const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function parsePackageJson(content) {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return null;
  }
}

export function findDependencyChanges(previousContent, nextContent) {
  const previous = parsePackageJson(previousContent);
  const next = parsePackageJson(nextContent);
  if (!previous || !next) return [];
  const changes = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const before = previous[section] ?? {};
    const after = next[section] ?? {};
    for (const [name, version] of Object.entries(after)) {
      if (!(name in before)) {
        changes.push({ section, name, change: 'added', version });
      } else if (before[name] !== version) {
        changes.push({ section, name, change: 'version changed', version, previousVersion: before[name] });
      }
    }
  }
  return changes;
}

export function describeDependencyChange(change) {
  if (change.change === 'added') {
    return `${change.name}@${change.version} (new, ${change.section})`;
  }
  return `${change.name}: ${change.previousVersion} -> ${change.version} (${change.section})`;
}
