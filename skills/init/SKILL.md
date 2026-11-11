---
name: init
description: Set up Mizan in an existing project. Detects the stack and commands, confirms them with the user, and writes the project profile. Use when the user asks to set up, enable or install Mizan in this repo.
---

1. Run the setup command given in the session context (`node ".../scripts/mizan.mjs" init`). Pass `--strictness` only if the user said which level they want. Add `--ci` only if the user wants the GitHub Actions check.
2. Show the user the detected commands and ask them to confirm or correct them in one question. Ask which strictness they want, recommending `standard`:
   - light: guardrails warn instead of block, no change note required. For prototypes.
   - standard: tests first, tests locked, comments blocked, out-of-scope edits warned, change notes required.
   - strict: everything in standard, plus out-of-scope edits blocked and every edit must belong to a task.
   Edit `.mizan/config.json` with the answers. A missing `commands.test` must be resolved before any task can run.
3. Write `.mizan/project.md`. Delegate the exploration to an Explore agent (medium thoroughness) and ask it for: what the project is, stack, how to run it, folder structure, existing conventions (naming, state, data fetching, styling, errors, tests), reusable building blocks, and sensitive areas. Keep the profile under 80 lines. It is read at every planning step, so every line must earn its place.
4. Run `.mizan/.local/mizan doctor` and summarize anything marked FIX in plain words.
5. Tell the user what Mizan will now do in this project, in five lines or fewer, and that everything is uncommitted for them to review.
