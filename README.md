<p align="center">
  <img src="assets/icon.png" alt="Mizan icon" width="120">
</p>

<h1 align="center">Mizan</h1>

Mizan (ميزان, "balance" or "the scales") is a Claude Code plugin that makes AI-written code meet a human engineering standard. Install it once, switch it on per project, and every change goes through the same loop: plan, failing tests, implementation, browser QA, code and security review, and a plain-language change note. Every step is logged with who did it and when.

## What it does

| You get | How |
|---|---|
| Test-first development | A task cannot move to implementation until the test suite fails, and cannot leave it until the type check, lint and tests pass. Tests are locked while code is written. Going back to fix a test needs your approval (`mizan task back test`). |
| Browser testing | A QA agent drives a real Chrome via the bundled Chrome DevTools MCP server: user flows, console errors, failed requests, mobile and desktop layouts, keyboard use and Lighthouse accessibility. |
| No drift, no duplication | Each task has a plan with an explicit file scope, reviewed by a critic before any code. Edits outside the scope are warned or blocked. Reviewers look for duplicated and dead code. |
| Deep root cause analysis | `/mizan:fix` refuses to plan a fix until the root cause is proven with evidence, then requires a regression test and a full RCA document. |
| Readable code, no comments | Comments added to code are blocked (tooling directives such as `@ts-expect-error` are allowed). Standards demand clear names, explicit state and no hidden defaults. |
| Security on every change | Secrets in code are blocked. `.env` and key files cannot be read, searched or written. Risky shell commands are blocked or need your approval. New dependencies need your approval, whichever package manager is used. A security reviewer checks every diff against OWASP. |
| Claude cannot loosen its own rules | Changing Mizan's config, a task's phase or scope, or per-machine state needs your approval. If the config is broken, Mizan blocks edits until it is fixed instead of silently switching off. |
| Never assumes business decisions | Business, product, data and security questions are always asked with options and a recommendation. Technical inferences are announced. Both are recorded in `.mizan/decisions.md`. |
| Audit log | `.mizan/log.jsonl` records every task, phase change, decision and edit with date, author (from `git config user.name`), branch and commit. Edits made outside a task are logged too. |
| Plain-language change notes | Every finished task leaves `.mizan/changes/<date>-<task>.md`, which explains what changed, why, where, how it works and how to check it, for both technical and non-technical readers. |
| Continuity | A handoff file is refreshed at the end of every session and summarized at the start of the next. Corrections become permanent project rules with `/mizan:learn`. |
| Token efficiency | About 1.3k tokens always loaded. Skills, agents and standards load only when used. Hooks cost nothing. Cheaper models run search, tests, QA and writing; the strongest runs planning, RCA and review. Gate output is trimmed to the last lines. |

## Install

From a local folder:

```
/plugin marketplace add /path/to/mizan
/plugin install mizan@mizan
```

From GitHub, once hosted:

```
/plugin marketplace add <owner>/mizan
/plugin install mizan@mizan
```

Then, in each project where you want it:

```
/mizan:init     existing project
/mizan:new      brand new project
```

Mizan does nothing in a project until it is set up there.

Requirements: Node 18 or newer and git, on macOS or Linux. On Windows, use WSL.

## Commands

| Command | Use it for |
|---|---|
| `/mizan:build <feature>` | Any new feature or behaviour change |
| `/mizan:fix <bug>` | Any bug, with root cause analysis |
| `/mizan:quick <change>` | Small, low-risk changes (1 to 3 files, no business decisions) |
| `/mizan:decisions` | Review, accept or reverse what auto mode decided on its own |
| `/mizan:status` | What is in progress and blocked, and recent activity |
| `/mizan:digest [days]` | A plain summary of who changed what |
| `/mizan:handoff` | Leave notes for the next session or person |
| `/mizan:learn <rule>` | Turn a correction into a permanent project rule |
| `/mizan:pr` | A PR description from change notes, with an optional Linear update |
| `/mizan:doctor` | Check that the setup and tools are healthy |

The agents and skills drive the CLI at `.mizan/.local/mizan`, which you can also run yourself.

## Guided and auto mode

| | Guided (default) | Auto |
|---|---|---|
| Plan approval | You approve it | Claude approves it and logs that no person has reviewed it yet |
| Business and product questions | Claude asks you, with options and a recommendation | Claude picks its recommendation, logs it as an auto decision, tells you, and keeps going |
| Security and privacy decisions | Asked | Still asked |
| Push, deploy, publish, data deletion, schema changes, new dependencies | Asked | Still asked |
| Tests first, tests locked, checks green, secrets and comments blocked | Enforced | Enforced |
| Where the work goes | Your current branch | A new `mizan/<task>` branch, uncommitted, never pushed |
| At the end | Summary | Summary plus a report of every decision made without asking |

Set the project default with `"mode"` in `.mizan/config.json` (changing it needs your approval), or choose per task: `/mizan:build add CSV export --auto`. Review what auto mode decided with `/mizan:decisions`. Accepting or reversing a decision always needs a person, and every decision and review is in the audit log.

## Strictness

Set in `.mizan/config.json`.

| | light | standard | strict |
|---|---|---|---|
| Failing tests required before implementing | no | yes | yes |
| Tests locked during implementation | warn | block | block |
| Comments added to code | warn | block | block |
| Edits outside the plan's scope | allowed | warn | block |
| Edits with no active task | logged | logged | block |
| Stop with failing tests | allowed | blocked (3 retries) | blocked (3 retries) |
| Change note required | no | yes | yes |
| New dependency | allowed | ask | ask |
| Secrets, `.env`, keys, dangerous commands | block | block | block |

## What it adds to a project

```
.mizan/
  config.json       commands, strictness, options (commit this)
  project.md        project profile read at every planning step
  rules.md          rules learned from the team
  decisions.md      every question asked and inference made
  log.jsonl         audit log, append-only, merges cleanly across branches
  handoff.md        where things stand
  changes/          one plain-language note per finished task
  rca/              one root cause analysis per fix
  tasks/            plan, QA and review records per task
  .local/           per-machine state (git-ignored)
```

## CI

`mizan init --ci` adds `.github/workflows/mizan.yml`. It scans the pull request's commits for secrets with gitleaks, scans for new security findings with semgrep (existing findings do not fail the build), and checks that the pull request adds no code comments or secrets, includes a change note and a log entry, and passes the type check, lint and tests. It installs dependencies with whichever package manager the lockfile shows. This catches changes made by hand or with other tools too. Set the `MIZAN_REPOSITORY` repository variable to where Mizan is hosted (plus a `MIZAN_TOKEN` secret if that repository is private).

## Limits

Hooks are hard gates, and they fail closed: if a check cannot run, the action is blocked with an explanation. Instructions to agents are strong guidance with reviewers as a second line. Mizan reduces risk a great deal, but it cannot promise zero vulnerabilities, and a determined workaround (for example obfuscated shell commands) can get past pattern-based checks. Pair it with human review of the diff and with the CI workflow.

## Developing Mizan

```
npm test
claude plugin validate . --strict
claude --plugin-dir . plugin details mizan
```
