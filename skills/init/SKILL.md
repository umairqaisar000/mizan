---
name: init
description: Set up Mizan in an existing project. Detects the stack and commands, confirms them with the user, and writes the project profile. Use when the user asks to set up, enable or install Mizan in this repo.
---

1. Run the setup command given in the session context (`node ".../scripts/mizan.mjs" init`). Pass `--strictness` only if the user said which level they want. Add `--ci` only if the user wants the GitHub Actions check.
2. Show the user the detected commands and ask them to confirm or correct them in one question. Ask which strictness they want, recommending `standard`:
   - light: guardrails warn instead of block, no change note required. For prototypes.
   - standard: tests first, tests locked, comments blocked, out-of-scope edits warned, change notes required.
   - strict: everything in standard, plus out-of-scope edits blocked and every edit must belong to a task.
   Also ask for the default mode, recommending `guided`:
   - guided: Claude asks before plans and business decisions.
   - auto: Claude decides, logs each decision for review, and only stops for push, deploy, publish, data deletion, schema changes, new dependencies, and security or privacy decisions. Any single task can still be switched with --auto or --guided.
   Ask which tracker the team uses: Linear, Jira, GitHub Issues, GitLab Issues, Azure DevOps, Asana, ClickUp, Shortcut, monday.com, Notion, or other. Then ask which context sources Claude may read, read only, at the start of each task: the tracker (recommended on), Granola meetings, and Gmail. Explain that Granola and Gmail can contain personal or patient details, which Mizan summarizes and never copies, and that nothing is ever posted or sent. Each source needs its connector to be available in Claude.
   If they chose auto mode, ask whether auto mode may post its important questions as a comment on the task's ticket and pause until they are answered (recommended off until they have tried auto mode), and who may answer: the ticket's assignee or creator (recommended), or a list of names. Explain that this is the only thing Mizan posts without asking each time, and that answers from anyone else are ignored.
   Once the tracker is chosen, check that Claude can reach it. For Linear, Jira and the other connector-based trackers, look for that connector's tools in this session (Jira uses the Atlassian connector). For GitHub run `gh auth status`, for GitLab `glab auth status`. If it is missing, give the exact steps and wait: add the connector on claude.ai under Settings, Connectors and sign in through the browser, then run /mcp; or run `! gh auth login` / `! glab auth login`. Never ask for an API key or token. If they want to connect later, note it and keep the tracker features off until doctor shows it connected.
   Ask how firm the teach-back check should be, recommending `offer`: at the end of each task Claude explains what was done and offers two or three questions so the person can explain it themselves; `required` means a task cannot close until they do; `off` skips it. The change note's "If someone asks you" section and /mizan:explain are always available.
   Edit `.mizan/config.json` with the answers (`learning.teachBack`, `strictness`, `mode`, `commands`, `tracker.name`, `context.tracker`, `context.granola`, `context.gmail`, `tracker.askQuestions`, `tracker.answerers`, and `tracker.postUpdates` if they want the end-of-task summary offered on the ticket). A missing `commands.test` must be resolved before any task can run.
3. Write `.mizan/project.md`. Delegate the exploration to an Explore agent (medium thoroughness) and ask it for: what the project is, stack, how to run it, folder structure, existing conventions (naming, state, data fetching, styling, errors, tests), reusable building blocks, and sensitive areas. Keep the profile under 80 lines. It is read at every planning step, so every line must earn its place.
4. Run `.mizan/.local/mizan doctor` and summarize anything marked FIX in plain words.
5. Tell the user what Mizan will now do in this project, in five lines or fewer, and that everything is uncommitted for them to review.
