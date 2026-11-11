---
name: build
description: Build a feature test-first with Mizan. Plan, critique, approval, failing tests, implementation with tests locked, browser QA, code and security review, plain-language change note. Use for any new feature or behaviour change.
argument-hint: <what to build> [ticket id]
---

The CLI is `.mizan/.local/mizan`. Run `.mizan/.local/mizan task next` to move each phase forward. It refuses until the phase's gate passes, and the hooks enforce the rest. Keep your own messages short. Agents return summaries, so do not re-read what they already read.

If a task is already active, continue it from its current phase instead of starting another.

## 1. Plan
- Start: `mizan task start <short-slug> --title "<title>" --kind feature [--ticket <ID>]`.
- Send the `mizan:planner` agent the request, the ticket text if there is one, and the plan path. Then send `mizan:critic` the plan path.
- If the critic says CHANGES, have the planner fix the plan once with the critic's findings. If it disagrees, give the user both views.
- Show the user a short summary: approach, files, tests, and the open questions with your recommendations. Ask them to approve or answer. Before asking, run `mizan task block "<question>"`. After they answer, run `mizan task unblock "<answer>"`.
- Record each answer with `mizan decision ... --kind asked --answer ...` and each inference with `--kind inferred`. Fill in the plan's Approval section.
- Register scope: `mizan scope add <path> --reason "<why>"` for each planned file, and `mizan task set-ui yes|no`.
- `mizan task next`.

## 2. Test (red)
- Send `mizan:test-writer` the plan path. Then `mizan task next`. The gate runs the suite and needs it to fail. If it passes, the tests are not testing the new behaviour: send them back.

## 3. Implement (green)
- Send `mizan:implementer` the plan path and the failing-test summary. If it reports that a file outside scope must change, decide with the user before adding it to scope (Mizan asks them to confirm).
- If it reports that a test is wrong, show the user why. If they agree, run `mizan task back test "<reason>"`.
- `mizan task next` (runs type check, lint and tests).

## 4. QA
- UI work: send `mizan:browser-qa` the task id and plan path. On FAIL, send the findings to the implementer and repeat QA.
- No UI: write `qa.md` with Result NOT_APPLICABLE and a one-line reason, keeping the other sections short.
- `mizan task next`.

## 5. Review
- Send `mizan:code-reviewer` and `mizan:security-reviewer` the task id in parallel. Merge their results into `review.md`.
- Send blocking findings to the implementer, then review again. Show non-blocking ones to the user.
- If a finding needs a new or changed test, tests are locked: ask the user, then run `mizan task back test "<reason>"`. Mizan asks the user to confirm, and every gate after the test phase runs again.
- `mizan task next`.

## 6. Document and close
- Send `mizan:scribe` the task id and change note path. Read the note once and fix anything inaccurate.
- `mizan task next` closes the task and writes the log entry.
- If Linear is enabled in `.mizan/config.json` and the task has a ticket, offer to post the one-sentence summary and the change note to the ticket. Post only if the user says yes.
- Tell the user in five lines or fewer: what was built, the test results, the QA result, where the change note is, and that nothing was committed.
