# Security standards

Every change is reviewed against this list. Any "must" that fails blocks the task.

## Input and output

- Must validate every input that crosses a trust boundary (HTTP body, query, params, headers, cookies, files, webhooks, messages, environment) with a schema: type, length, range, format. Reject on failure; do not try to repair input.
- Must use parameterized queries or the ORM's bound parameters. Never build SQL, NoSQL filters, shell commands or file paths by string concatenation with user data.
- Must encode output for its context. In React never use `dangerouslySetInnerHTML` with untrusted data; if HTML must be rendered, sanitize it with a vetted library (DOMPurify).
- Must not pass user input to `eval`, `new Function`, `setTimeout(string)`, `child_process.exec`, dynamic `require`/`import`, or a template engine compiled at runtime.
- Must resolve and check file paths against an allowed base directory to prevent path traversal.
- Must check redirects and outbound URLs against an allowlist (open redirect and SSRF).

## Authentication and authorization

- Must check authorization on the server for every request that reads or changes data, by resource owner, not just "is logged in" (broken object level authorization is the most common API flaw).
- Must not trust anything from the client for authorization: hidden fields, role claims in local storage, disabled buttons.
- Must hash passwords with argon2id or bcrypt. Never store or log them.
- Sessions: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` cookies; rotate on login; expire on logout and timeout.
- Must protect state-changing requests against CSRF when using cookie auth.
- Must rate-limit login, signup, password reset, OTP and any expensive endpoint.

## Secrets and data

- Must never put secrets in code, tests, logs, error messages, URLs or client bundles. Read them from the environment or a secrets manager. Only variables meant to be public may use the framework's public prefix (`VITE_`, `NEXT_PUBLIC_`).
- Must not log personal or health data, tokens, passwords or full request bodies. Log identifiers instead.
- Must return generic error messages to clients; keep details in server logs.
- Collect and keep only the data the feature needs.

## Transport and headers

- HTTPS only. Set `Strict-Transport-Security`, a `Content-Security-Policy` without `unsafe-inline` where possible, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `frame-ancestors`.
- CORS: an explicit allowlist of origins. Never `*` with credentials.

## Dependencies and supply chain

- New or upgraded packages need the user's approval (Mizan asks automatically).
- Prefer well-maintained packages with many users. Check for known vulnerabilities (`npm audit`, `osv-scanner`).
- Pin versions with a lockfile. Never pipe a download into a shell.

## Client side

- Never store tokens in `localStorage` when an `HttpOnly` cookie is possible.
- Do not expose internal IDs, stack traces, or feature flags meant for staff.
- File uploads: check type by content, cap size, store outside the web root, serve with `Content-Disposition`.

## Review checklist (OWASP Top 10 and API Top 10)

For every diff, answer: Who can call this? What do they control? What do they get back? What happens if they send something huge, malformed, or for someone else's resource? What is logged? What new package or permission does this add?
