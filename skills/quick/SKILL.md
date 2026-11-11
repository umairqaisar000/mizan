---
name: quick
description: A small, low-risk change through Mizan, such as copy text, a style tweak, a one-function fix or a config value. Still test-first, reviewed and logged, but with a lighter plan and no browser QA phase. Use only when the change touches 1 to 3 files and needs no business decisions.
argument-hint: <small change>
---

If the change needs a business decision, touches auth, payments, personal data or the database schema, or spans more than 3 files, use /mizan:build or /mizan:fix instead and tell the user why.

1. `mizan task start <slug> --title "<title>" --kind quick`. Fill in the plan yourself, briefly: one line per section is fine. Search for existing code first. Tell the user the plan in three lines and get a yes. Register scope, set UI yes or no, then `mizan task next`.
2. Write the failing test yourself (follow `.mizan/.local/standards/testing.md`), then `mizan task next`.
3. Implement (follow `.mizan/.local/standards/code.md`), then `mizan task next`.
4. Send `mizan:code-reviewer` the task id. If the change touches input handling, output rendering or config, also send `mizan:security-reviewer`. Write `review.md`, then `mizan task next`.
5. Write the change note yourself, keeping it short but complete, then `mizan task next`.
