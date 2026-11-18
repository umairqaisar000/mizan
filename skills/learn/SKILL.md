---
name: learn
description: Save a correction or preference as a permanent project rule, so Mizan follows it in every future session. Use when the user corrects how Claude works, or says "always", "never" or "from now on".
argument-hint: <rule>
---

1. Rewrite the rule as one clear, testable sentence ("Use the shared Money type for all prices", not "be careful with prices"). If it conflicts with an existing rule in `.mizan/rules.md` or a Mizan standard, show the conflict and ask which wins.
2. Show the rule to the user and ask for a yes.
3. Ask, or take from the conversation, the problem the rule prevents, in one sentence. A rule without a reason cannot be reviewed later.
4. Run `.mizan/.local/mizan rule add "<rule>" --why "<problem it prevents>"`. Add `--from <task id>` when it came out of a task.

Rules keep a track record: `mizan rule held <id> "<what it prevented>"` when a rule stops a mistake, `mizan rule recurred <id> "<what happened>"` when its problem comes back anyway, and `mizan rule list` to see each rule with its reason and record. `/mizan:doctor` flags rules to review: ones whose problem keeps coming back, ones learned with a different model than the team now uses, and ones with no record of preventing anything in 60 days. Retiring a rule always needs the user's yes.
