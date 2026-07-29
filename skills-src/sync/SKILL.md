---
name: sync
description: "Run /sync as the last step after a change is complete, around merge, to keep durable knowledge current. Updates root and nested AGENTS.md, reconciles the scope from repo evidence, and flags specs the change made stale. Surgical edits only: it adds lines and rewrites single lines it owns, never a whole section and never curated prose."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent
argument-hint: "[empty, or a path to scope the reconcile]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: off
  review: off
  done: checklist
---

## What this skill does

Reconciles the durable files to what the repo now shows: AGENTS.md, the scope,
and spec statuses. Run it around merge, after the change is complete.

Without it, the context files drift from the code, and every later skill reads a
description of a project that no longer exists.

## Boundaries

These keep this skill from sprawling into a rewrite tool:

- **Adds lines. Rewrites only single lines it owns.** Never a whole section.
- **Never touches curated prose.** A paragraph a person wrote stays as written.
  Where the repo contradicts it, report the contradiction rather than fixing it.
- **Never writes code, tests, or new specs.** It changes a spec's status line,
  not its content.

The restraint is the feature. A maintenance pass that rewrites freely is one
nobody can run without reading the whole diff afterwards.

## Asks vs acts

Act without asking when adding a missing line or correcting a status that the
repo plainly contradicts. Ask before removing anything.

## Artifact ownership

Owns AGENTS.md maintenance after `/audit` created it, scope status lines, and
spec status lines. Nothing else.

## Execution

1. Scope the change set: the commit range or the working tree, with a per file
   status. Work only from files that actually changed.
2. Locate the context files and specs the change touches. Paths only at this
   stage: reading everything up front costs context you will need later.
3. Update AGENTS.md where the change altered something durable: a new command, a
   new dependency, a moved directory, a changed convention. A change that alters
   nothing durable produces no edit, and that is a correct outcome.
4. Reconcile scope statuses from repo evidence. A feature with shipped code is
   `done` whatever the file said. A feature marked done with no code is not.
5. Flag specs the change made stale. Flag them, do not rewrite them: correcting
   a spec is `/architect`'s job, because it means revisiting a decision.
6. Note any new tool or dependency that has an agent skill worth adopting, as a
   suggestion for the engineer.

## Completion report

Lead with what changed and what still needs a person. List the stale specs,
since those are the ones owing a decision. If nothing needed updating, say that
in one line rather than manufacturing a report.
