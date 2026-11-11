# Testing standards

## Order

1. Turn each acceptance criterion into one or more test cases before any implementation.
2. Run them and confirm they fail for the right reason: the behaviour is missing, not a typo, import error or broken setup.
3. Implement until they pass. Never edit a test during implementation. If a test is wrong, stop and explain.

## What to test

- The happy path for each acceptance criterion.
- Edge cases: empty, one, many, maximum, boundary values, unicode and right-to-left text, time zones, concurrency where it applies.
- Error paths: invalid input, network failure, timeouts, permission denied, not found, conflicts.
- Security cases: another user's resource, missing auth, oversized input, injection strings.
- For bugs: a regression test that reproduces the exact failure first.
- For UI: at least one Playwright end-to-end test of the user flow, using roles and labels (`getByRole`, `getByLabel`), never CSS classes or brittle XPath.

## How to write them

- Test behaviour through the public interface, not private details. A refactor that keeps behaviour must not break tests.
- One reason to fail per test. The name says the scenario and the expected outcome: `rejects a reset link older than 30 minutes`.
- Arrange, act, assert, visibly separated by blank lines.
- Assert specific values. `toBeDefined()`, `toBeTruthy()` and snapshot-only tests do not count as real assertions.
- No real network, clock or randomness in unit tests: inject them or use fakes. Freeze time explicitly.
- Tests are independent and can run in any order. Each one builds its own data.
- Test data is fake and obviously so. Never use production data or real personal details.
- Do not mock the thing under test. Mock only at the system boundary.

## Speed and tokens

- Run only the affected tests while iterating (for example `vitest related <file> --run` or `-t "<name>"`), then the full suite once before moving phase.
- When a test fails, read the first failure carefully before changing anything. Do not re-run an unchanged suite hoping for a different result.
