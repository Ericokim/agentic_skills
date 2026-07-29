---
name: audit
description: "Run /audit on a greenfield project, an existing codebase with missing docs, or one area (/audit src/auth) to bootstrap the AI context every later skill reads. Writes tool agnostic AGENTS.md plus thin CLAUDE.md pointers, adding only what is missing. Never overwrites curated content."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: "[path to one area, or empty for the whole repo]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: off
  review: off
  done: checklist
---

## What this skill does

Writes the context files that give every other skill this project's stack,
commands, and conventions. AGENTS.md is canonical because every agent tool reads
it; CLAUDE.md is a thin pointer to it, never a second copy.

Everything it writes is read off the real repository. This skill is the one most
able to poison every later skill with a confident guess, so a claim it cannot
back does not go in the file.

## Route first

- **A path** (`/audit src/auth`), audit that area and write a nested AGENTS.md.
- **No argument, and the repo has source**, audit the whole repo, filling gaps.
- **No argument, and the repo is nearly empty**, this is greenfield. Say so and
  stop: the stack has to be chosen (`/architect`) and the project scaffolded
  before there is anything true to write down.

That last case matters. An AGENTS.md written for an empty project describes
intentions as if they were facts, and every later skill then believes them.

## Acts vs asks

Act without asking when adding a section that does not exist. Ask before
changing any line a person wrote.

Never overwrite curated prose. Add what is missing, and where the repo
contradicts an existing line, report the contradiction rather than silently
resolving it.

## Artifact ownership

Owns AGENTS.md at the root and in subdirectories, plus the thin CLAUDE.md
pointer. Writes nothing else. `/sync` keeps these current afterwards.

## Execution

1. Establish the stack from evidence: package manifests, lockfiles, config
   files, CI workflows. Read them. A framework you infer from a directory name
   is not a framework you found.
2. Establish the commands the same way: the scripts a maintainer actually runs
   for install, build, test, lint, and dev. Take them from the manifest or the
   CI config, not from what is conventional for that stack.
3. Run the test and build commands if they are cheap and safe, and record
   whether they currently pass. A command listed in AGENTS.md that does not run
   is worse than no command, because every later skill will try it.
4. Read enough source to state the conventions honestly: layout, naming, error
   handling, how state is managed. Cite the files these came from.
5. Write AGENTS.md. Each claim carries its source. Anything you could not verify
   is written as unknown, not omitted and not guessed.
6. In a monorepo, give each workspace its own nested AGENTS.md with that
   workspace's own commands. A single root file that describes five packages
   describes none of them.

## What goes in AGENTS.md

Stack and versions. The exact commands. Layout and where things live.
Conventions a newcomer would get wrong. Known rough edges. Nothing else: this
file loads into an agent's context repeatedly, so every line is a recurring
cost.

## Completion report

Lead with what was written and the one thing that still needs a human answer.
Name the files. List anything recorded as unknown, because that is the list of
questions only a person can close.
