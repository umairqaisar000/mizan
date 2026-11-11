---
name: new
description: Start a brand new project the Mizan way. Interviews the user, proposes the most efficient stack and architecture with trade-offs, waits for approval, then scaffolds it with tests, lint, security checks and Mizan from day one.
---

Never pick the stack, hosting, database, auth provider or architecture for the user. Recommend, explain, and wait.

1. Interview. Ask, in at most two rounds of questions: what the product does and for whom, the core user flows for version 1, expected scale, data sensitivity (personal, health, payment), hosting or compliance constraints (for example data residency), team skills, budget, and deadline. Infer what you safely can, and say what you inferred.
2. Propose 2 or 3 options. For each: stack, architecture sketch, why it fits, cost, risks, and what it makes hard later. Recommend one and say why. Prefer boring, well-supported choices and the fewest moving parts that meet the needs. Default lean for JS/TS: TypeScript strict, Vite or Next.js for the UI, zod at boundaries, Vitest plus Playwright, ESLint plus Prettier.
3. Wait for the user's choice.
4. Set up Mizan first, so everything after this is logged: run the setup command from the session context with `--strictness standard`. From now on the CLI is `.mizan/.local/mizan`.
5. Record the interview answers and the chosen option with `.mizan/.local/mizan decision "<what was decided>" --kind asked --answer "<the choice>"`, one per decision. Record your inferences with `--kind inferred`.
6. Scaffold with the official generator for the chosen framework. Pinned versions, a lockfile, strict TypeScript, a test runner with one passing smoke test, Playwright with one smoke test, lint and format scripts, `.env.example` (never `.env`), a README with run instructions, and a sensible folder structure (feature folders, domain logic separate from UI). Each package the generator does not add by itself needs the user's approval.
7. Run `.mizan/.local/mizan init --refresh-commands` so Mizan picks up the new test, lint, type check and dev commands. Then continue with steps 2 to 5 of /mizan:init.
8. Log the setup with `.mizan/.local/mizan log "<summary>"`, then show the user the structure and the next suggested task.
