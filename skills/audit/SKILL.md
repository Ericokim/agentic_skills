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

This is a two phase flow, and the second phase is where the CLI, not this
skill, decides whether an answer stands.

1. Run `agentic context` if the command exists. It profiles the repository,
   selects the sections this project needs, pre-fills every fact the repo
   already states, and writes `AGENTS.draft.md` plus `AGENTS.brief.md`.
   If the command is missing, do the same work by hand and say so in the report.
2. Read `AGENTS.brief.md`. It lists every placeholder that still needs an
   answer and names the section each belongs to.
3. Answer each one from evidence, as a JSON object shaped exactly like this,
   one entry per placeholder name:

   ```json
   {
     "PRODUCT_SUMMARY": {
       "value": "a content management system for course material",
       "evidence": ["README.md:1-14"]
     }
   }
   ```

   A claim you cannot cite is written with `"value": "Unknown"` and no
   evidence, never guessed. Write this object to a file, for example
   `answers.json`.
4. Run the project's build and test commands, and record whether they currently
   pass. A command written down that does not run is worse than no command,
   because every later skill will try it.
5. Run `agentic context --answers answers.json`. The CLI does not take any
   answer's word for it: it re-reads every citation itself, and a value
   survives only when the file it names still contains it. Never write
   `AGENTS.md` directly, and never hand edit `AGENTS.generated.md` to restore
   a value the CLI rejected.
6. Read the CLI's report in full. A field it downgraded to `Unknown` means the
   claim could not be backed by its citation: re-answer that field with a
   better citation, or leave it `Unknown` for a person to close. Do not report
   this run as clean while any field was downgraded; the CLI itself exits non
   zero in that case.
7. The report already compares `AGENTS.generated.md` against any existing
   `AGENTS.md`, including anything the generated version would lose. Read
   that comparison rather than diffing the two files by hand.
8. In a monorepo, repeat per workspace. A single root file describing five
   packages describes none of them.

## What goes in AGENTS.md

Stack and versions. The exact commands. Layout and where things live.
Conventions a newcomer would get wrong. Known rough edges. Nothing else: this
file loads into an agent's context repeatedly, so every line is a recurring
cost.

## Completion report

Lead with what was written and the one thing that still needs a human answer.
Name the files. List anything recorded as unknown, because that is the list of
questions only a person can close.
