#!/usr/bin/env node
import { parseArguments } from './lib/arguments.mjs';
import { runCi } from './commands/ci.mjs';
import { runDecisions } from './commands/decisions.mjs';
import { runDoctor } from './commands/doctor.mjs';
import { runHandoff } from './commands/handoff.mjs';
import { runInit } from './commands/init.mjs';
import { runDecision, runLog, runRule } from './commands/records.mjs';
import { runDigest, runStatus, runWhoami } from './commands/reports.mjs';
import { runScope } from './commands/scope.mjs';
import { runTask } from './commands/task.mjs';

const COMMANDS = {
  init: { run: runInit, usage: 'init [--strictness light|standard|strict] [--ci] [--refresh-commands]' },
  task: { run: runTask, usage: 'task start <slug> --title <title> [--kind feature|fix|quick] [--ticket ID] [--auto|--guided] | next | set-ui yes|no | back <phase> <reason> | block <question> | unblock [answer] | resume <id> | abandon <reason> | clear | show' },
  scope: { run: runScope, usage: 'scope add <path> --reason <why> | remove <path> | list' },
  log: { run: runLog, usage: 'log <summary> [--files a,b]' },
  decision: { run: runDecision, usage: 'decision <text> --kind asked|inferred [--answer <answer>] | --kind auto --category <category> --chosen <option> --options "a | b" --reason <why>' },
  decisions: { run: runDecisions, usage: 'decisions [list] | accept <id> [note] | reverse <id> <reason>' },
  rule: { run: runRule, usage: 'rule add <rule text>' },
  status: { run: runStatus, usage: 'status' },
  digest: { run: runDigest, usage: 'digest [--days 7]' },
  handoff: { run: runHandoff, usage: 'handoff' },
  doctor: { run: runDoctor, usage: 'doctor' },
  whoami: { run: runWhoami, usage: 'whoami' },
  ci: { run: runCi, usage: 'ci [--base origin/main]' },
};

function usageText() {
  return ['Usage: mizan <command>', ...Object.values(COMMANDS).map(({ usage }) => `  mizan ${usage}`)].join('\n');
}

function main() {
  const [commandName, ...rest] = process.argv.slice(2);
  const command = COMMANDS[commandName];
  if (!command) {
    process.stdout.write(`${usageText()}\n`);
    process.exitCode = commandName ? 1 : 0;
    return;
  }
  try {
    const output = command.run(parseArguments(rest));
    if (output) process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`mizan ${commandName}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
