---
name: fix
description: Fix a bug with Mizan using deep root cause analysis. Reproduce, prove the root cause, write a failing regression test, fix the cause rather than the symptom, verify in the browser, and write an RCA plus a change note. Use for any bug, error, regression or incident.
argument-hint: <bug description> [ticket id]
---

The CLI is `.mizan/.local/mizan`. A fix may not start until the root cause is proven. Patching a symptom is not a fix.

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
