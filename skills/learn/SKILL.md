---
name: learn
description: Save a correction or preference as a permanent project rule, so Mizan follows it in every future session. Use when the user corrects how Claude works, or says "always", "never" or "from now on".
argument-hint: <rule>
---

1. Rewrite the rule as one clear, testable sentence ("Use the shared Money type for all prices", not "be careful with prices"). If it conflicts with an existing rule in `.mizan/rules.md` or a Mizan standard, show the conflict and ask which wins.
2. Show the rule to the user and ask for a yes.
3. Run `.mizan/.local/mizan rule add "<rule>"`.
