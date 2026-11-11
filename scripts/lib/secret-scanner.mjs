const SECRET_PATTERNS = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe live key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

const CONNECTION_STRING_WITH_PASSWORD = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{6,})@([^\s/:?#]+)/gi;
const LOCAL_OR_EXAMPLE_HOST = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal|db|database|postgres|mysql|redis|mongo|.*\.local|.*\.test|.*\.example|example\.(?:com|org|net))$/i;
const MINIMUM_CREDENTIAL_LENGTH = 12;
const MINIMUM_CREDENTIAL_ENTROPY_BITS_PER_CHARACTER = 3;

const HARDCODED_CREDENTIAL_PATTERN = /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i;
const PLACEHOLDER_VALUE_PATTERN = /^(?:x+|\*+|changeme|change-me|placeholder|example|your[_-].*|<.*>|\$\{.*\}|test|dummy|fake|redacted)$/i;

export function findSecretsInLines(lines, { isTestFile }) {
  const findings = [];
  lines.forEach((line) => {
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ kind: name, line: redactLine(line) });
      }
    }
    for (const [, password, host] of line.matchAll(CONNECTION_STRING_WITH_PASSWORD)) {
      const isHarmless = LOCAL_OR_EXAMPLE_HOST.test(host) || PLACEHOLDER_VALUE_PATTERN.test(password) || password.startsWith('$');
      if (!isHarmless) findings.push({ kind: 'connection string with password', line: redactLine(line) });
    }
    if (isTestFile) return;
    const credentialMatch = HARDCODED_CREDENTIAL_PATTERN.exec(line);
    if (credentialMatch && looksLikeRealCredential(credentialMatch[1])) {
      findings.push({ kind: 'hardcoded credential', line: redactLine(line) });
    }
  });
  return findings;
}

export function addedLines(previousContent, nextContent) {
  const remainingCountByLine = new Map();
  for (const line of previousContent.split('\n')) {
    remainingCountByLine.set(line, (remainingCountByLine.get(line) ?? 0) + 1);
  }
  const added = [];
  for (const line of nextContent.split('\n')) {
    const remaining = remainingCountByLine.get(line) ?? 0;
    if (remaining > 0) {
      remainingCountByLine.set(line, remaining - 1);
    } else {
      added.push(line);
    }
  }
  return added;
}

function looksLikeRealCredential(value) {
  if (PLACEHOLDER_VALUE_PATTERN.test(value) || value.length < MINIMUM_CREDENTIAL_LENGTH) return false;
  const hasLetter = /[a-z]/i.test(value);
  const hasDigit = /\d/.test(value);
  return hasLetter && hasDigit && shannonEntropy(value) >= MINIMUM_CREDENTIAL_ENTROPY_BITS_PER_CHARACTER;
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function redactLine(line) {
  const trimmed = line.trim();
  const visible = trimmed.slice(0, 24);
  return trimmed.length > 24 ? `${visible}... (redacted)` : visible;
}
