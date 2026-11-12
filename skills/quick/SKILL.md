---
name: quick
description: A small, low-risk change through Mizan, such as copy text, a style tweak, a one-function fix or a config value. Still test-first, reviewed and logged, but with a lighter plan and no browser QA phase. Use only when the change touches 1 to 3 files and needs no business decisions.
argument-hint: <small change> [--auto|--guided]
---

If the change needs a business decision, touches auth, payments, personal data or the database schema, or spans more than 3 files, use /mizan:build or /mizan:fix instead and tell the user why.

## Mode: guided or auto

Pass `--auto` or `--guided` to `mizan task start` if the user said which. Otherwise the project default from `.mizan/config.json` applies. The start output says which mode the task is in.

- **Guided:** ask the user wherever these steps say to ask.
- **Auto:** never wait for the user at an "ask" step. Pick the option you would recommend, record it with `mizan decision "<question>" --kind auto --category <product|technical|ux|data|money|legal> --chosen "<option>" --options "<a> | <b>" --reason "<why>"`, tell the user in one line what you decided, and continue. Fill in the plan's Approval section as "Auto mode: approved by Mizan on <date>, not yet reviewed by a person".
- **Hard stops, even in auto mode:** `git push`, deploys, publishing, deleting data, database schema changes, new or upgraded dependencies, and any security or privacy decision. For these, run `mizan task block "<question with options and your recommendation>"`, ask the user, and wait. Mizan enforces most of these, and refuses to record security or privacy decisions as auto.
- Auto mode works on its own branch and never commits or pushes. When the task closes, show the user the auto mode report from `mizan task next`, and offer (do not post) the Linear summary.

1. `mizan task start <slug> --title "<title>" --kind quick`. Fill in the plan yourself, briefly: one line per section is fine. Search for existing code first. Tell the user the plan in three lines and get a yes (in auto mode, state it and continue). Register scope, set UI yes or no, then `mizan task next`.
2. Write the failing test yourself (follow `.mizan/.local/standards/testing.md`), then `mizan task next`.
3. Implement (follow `.mizan/.local/standards/code.md`), then `mizan task next`.
4. Send `mizan:code-reviewer` the task id. If the change touches input handling, output rendering or config, also send `mizan:security-reviewer`. Write `review.md`, then `mizan task next`.
5. Write the change note yourself, keeping it short but complete, then `mizan task next`.
