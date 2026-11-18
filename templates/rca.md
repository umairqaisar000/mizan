# Root cause analysis: {{title}}

Task: {{taskId}} | Ticket: {{ticket}} | Opened {{date}} by {{author}}

## Symptom

(fill in) What the user sees, in their words, and how often. Include the exact error message if there is one.

## Reproduction

(fill in) Exact steps, data and environment that make it happen every time. If it cannot be reproduced yet, say what was tried.

## Evidence

(fill in) Logs, console errors, network requests, stack traces, git history, and the test or command output that shows the fault. Quote only what matters. If `mizan causes` found the same cause before, say where and what was tried then.

## Timeline

(fill in) When it started and what changed around then (deploys, commits, config, data, dependencies).

## Root cause

(fill in) The single underlying cause, proven by the evidence. Walk the "why" chain until you reach something that, if changed, makes this class of bug impossible. A symptom is not a root cause.

## Root cause label

(fill in) One short lowercase label for this kind of cause, for example `rounding-each-part` or `missing-null-check`. Run `mizan causes` first and reuse an existing label when it is the same cause.

## Why it was not caught

(fill in) Which test, check, review or monitoring should have caught it, and why it did not.

## Fix

(fill in) What was changed and why that fixes the root cause rather than hiding the symptom.

## Prevention

(fill in) The regression test added, plus any guardrail, lint rule, type or monitoring that stops it coming back.
