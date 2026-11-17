---
name: doctor
description: Check that Mizan and its tools are set up correctly in this project. Configured commands, author identity, git settings, CI, Playwright, and the optional security scanners.
disable-model-invocation: true
---

Run `.mizan/.local/mizan doctor`. For each FIX line, explain in one plain sentence what it affects, and offer to fix the ones you can. Ask before installing anything.

For each CHECK line, look at the tools available to you in this session. Report OK if you have the named connector's tools, otherwise FIX with the exact steps from the line. Never ask the user for an API key or token: every tracker connects through a browser sign-in.
