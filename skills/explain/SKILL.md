---
name: explain
description: Explain, in plain words, what Mizan and Claude did and why, so the person can answer questions about it. Works for a task, a file, a past change, a decision, or a period such as "what did I ship this week". Use when the user asks what was done, why, how something works, or to prepare for a standup, review or client question.
argument-hint: [task id | file | ticket | "this week"]
---

Read only. Never change code or records here, except the personal learning notes in step 4.

1. Find the records, searching before reading:
   - a task id or ticket: `.mizan/tasks/<id>/` (plan, context, qa, review, state.json), `.mizan/changes/<id>.md`, `.mizan/rca/<id>.md`, and its entries in `.mizan/decisions.md`;
   - a file: `.mizan/log.jsonl` entries that list it, then those tasks' change notes;
   - a period: `.mizan/.local/mizan digest --days <n>`, then the change notes it names.
2. Explain at the level the user asks for. If they do not say, give:
   - **In one sentence**, for someone who does not code.
   - **The problem**: what was wrong or needed, and the evidence.
   - **What was done and why**: the approach, the main alternative and why it lost, and the decisions with who made them (the user, someone on the ticket, or Claude in auto mode).
   - **How we know it works**: the tests, the browser check, and the review.
   - **What could come up**: risks, follow-ups, and the likely questions with short answers, reusing the change note's "If someone asks you".
   Cite the record for each point, for example "(change note, Why)" or "(decision Q-1a2b3c, answered by the ops lead)". Explain any technical word in the same sentence. If a record is missing, say so instead of guessing.
3. Offer a short teach-back: ask whether they want two or three questions to check they can explain it. If yes, ask them one at a time, correct gently and precisely, and finish with the one thing worth remembering. Outside a closing task, nothing is recorded.
4. For any concept they were unsure about, run `.mizan/.local/mizan concepts` to see what they already know, and add new ones with `.mizan/.local/mizan concepts add "<term>" --explain "<two plain sentences, with the example from this work>"`.
