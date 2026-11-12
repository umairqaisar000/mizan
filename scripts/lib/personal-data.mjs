const PERSONAL_DATA_PATTERNS = [
  { kind: 'email address', pattern: /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b|users\.noreply\.github\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { kind: 'phone number', pattern: /(?<![\w.])(?:\+|00)\d{1,3}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){2,4}\b|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b/ },
  { kind: 'national ID or iqama number', pattern: /\b[12](?!\d*0{5}\b)\d{9}\b/ },
  { kind: 'IBAN', pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){4,7}\b/ },
];

export function findPersonalData(lines) {
  const findings = [];
  for (const line of lines) {
    for (const { kind, pattern } of PERSONAL_DATA_PATTERNS) {
      if (pattern.test(line)) findings.push(kind);
    }
  }
  return [...new Set(findings)];
}
