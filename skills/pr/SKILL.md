---
name: pr
description: Write a pull request description from the Mizan change notes, and optionally open the PR and update the Linear ticket. Use when the user wants to open or describe a PR for finished Mizan work.
argument-hint: [task id]
---

1. Find the change notes for this branch: the closed tasks in `.mizan/log.jsonl` on the current branch, or the task id given.
2. Write `.mizan/tasks/<task id>/pr.md`: a title under 70 characters; a Summary (the "In one sentence" lines); Changes (the "Where" lists, merged); How to test; Security notes; Risks; links to the change notes and RCA. Plain language, no em dashes.
3. Show it to the user. Open the PR with `gh pr create --body-file` only if the user asks, and only after they confirm the base branch. Never push without being asked.
4. If Linear is enabled in `.mizan/config.json` and there is a ticket, offer to post the PR link and summary as a comment. Post only on a yes.
