---
name: fix
description: Fix a bug with Mizan using deep root cause analysis. Reproduce, prove the root cause, write a failing regression test, fix the cause rather than the symptom, verify in the browser, and write an RCA plus a change note. Use for any bug, error, regression or incident.
argument-hint: <bug description> [ticket id] [--auto|--guided]
---

The CLI is `.mizan/.local/mizan`. A fix may not start until the root cause is proven. Patching a symptom is not a fix.

## Mode: guided or auto

Pass `--auto` or `--guided` to `mizan task start` if the user said which. Otherwise the project default from `.mizan/config.json` applies. The start output says which mode the task is in.

- **Guided:** ask the user wherever these steps say to ask.
- **Auto:** never wait for the user at an "ask" step. Pick the option you would recommend, record it with `mizan decision "<question>" --kind auto --category <product|technical|ux|data|money|legal> --chosen "<option>" --options "<a> | <b>" --reason "<why>"`, tell the user in one line what you decided, and continue. Fill in the plan's Approval section as "Auto mode: approved by Mizan on <date>, not yet reviewed by a person".
- **Hard stops, even in auto mode:** `git push`, deploys, publishing, deleting data, database schema changes, new or upgraded dependencies, and any security or privacy decision. For these, run `mizan task block "<question with options and your recommendation>"`, ask the user, and wait. Mizan enforces most of these, and refuses to record security or privacy decisions as auto.
- Auto mode works on its own branch and never commits or pushes. When the task closes, show the user the auto mode report from `mizan task next`, and offer (do not post) the Linear summary.

## 1. Investigate
- Start: `mizan task start <slug> --title "<title>" --kind fix [--ticket <ID>]`. This creates the RCA file in `.mizan/rca/`.
- Send `mizan:investigator` the bug report, the ticket text, and the RCA path.
- If the investigator cannot prove the cause, tell the user exactly what evidence is missing and ask for it. Block the task while waiting. Never guess, and never touch production systems without the user's explicit go-ahead.
- Show the user the root cause in two sentences with the evidence, and the confidence. Then `mizan task next`.

## 2. Plan
- Send `mizan:planner` the RCA path and the plan path. The plan must fix the root cause and list the regression test that reproduces the bug. Have `mizan:critic` check that the fix addresses the root cause and not the symptom.
- Get the user's approval, register scope, set UI yes or no, then `mizan task next`.

## 3 to 6.
Follow phases 2 to 6 of /mizan:build exactly: failing regression test, fix with tests locked, browser QA reproducing the original steps to show the bug is gone, both reviews, and the change note.

Before closing, fill in the RCA's Fix and Prevention sections. The close gate checks that the whole RCA is complete.
