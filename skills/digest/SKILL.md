---
name: digest
description: A plain-language summary of what changed in this project over the last week (or another period). Who did what and when, the decisions made, and edits made outside a task.
argument-hint: [days]
disable-model-invocation: true
---

Run `.mizan/.local/mizan digest --days <days, default 7>`. Turn it into a short summary a manager or other non-technical reader could follow: what is new for users, what was fixed, the decisions made, and anything worth attention (edits outside a task, abandoned tasks). Read change notes only if the summary needs a detail. Offer to save it as `.mizan/digests/<date>.md`.
