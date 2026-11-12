---
name: decisions
description: Review the decisions Claude made on its own in auto mode. Lists every auto decision waiting for review, with the options it considered and why it chose, so the user can accept or reverse each one.
disable-model-invocation: true
---

1. Run `.mizan/.local/mizan decisions` and show the list as a short table: id, task, the question, what was chosen, why, and the other options.
2. Ask the user, in one question, which to accept and which to reverse. Recommend accepting the ones that match existing code and project rules, and flag any that look risky.
3. For each answer, run `.mizan/.local/mizan decisions accept <id> [note]` or `.mizan/.local/mizan decisions reverse <id> <reason>`. Mizan asks the user to confirm each one, because reviewing is the user's call.
4. For each reversed decision, offer to start a task that changes the code: /mizan:quick for small ones, /mizan:build or /mizan:fix otherwise.
