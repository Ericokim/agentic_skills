---
name: develop
description: "Run /develop to build a feature, UI or backend: a page, component, API, service, or data slice. If something load bearing is undecided and no spec records it, it stops and routes you to /architect. Otherwise it reads the spec plus AGENTS.md, builds against the acceptance criteria, and advances the scope."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: "[feature or surface to build]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: off
  done: checklist
---

## What this skill does

Builds one feature from its spec, then advances the scope entry. It is the only
skill that writes application code.

## Step 0: the spec gate, always first

Before writing any code, answer one question: would building this mean inventing
a load bearing decision that no spec records?

- **No**, build.
- **Yes**, stop and route to `/architect`. Name the specific decision that is
  owed.

The engineer can override and tell you to build anyway. The override is honored,
and it is not free: record the assumption as an `Assumed` spec in `docs/specs/`
and flag it on the feature. The flag never blocks declaring the feature done. It
exists so the decision is not silently lost.

## Before you build

- The project must already exist. Scaffolding is its own task, not something to
  improvise partway through a feature.
- Check that the working tree is current and that nobody else is mid change in
  the same files. Building on stale state produces a diff nobody can review.
- Read AGENTS.md for the commands and conventions, and the spec for the
  contract. Build to the acceptance criteria, not to your own idea of the
  feature.

## Asks vs acts

Act without asking inside the spec. Ask when the spec is silent on something
load bearing, which is the gate above.

Do not expand scope. A related improvement you noticed is worth reporting, not
worth building unasked.

## Artifact ownership

Owns application source, migrations, and the design system file when the change
is visual. Advances the status of its scope entry. Never writes specs, never
writes AGENTS.md.

## Execution

1. Restate the acceptance criteria you are building to.
2. Build in the smallest slices that each end in something runnable.
3. Run migrations forward, and confirm they run. A migration that was written
   but not run is not a migration.
4. Run the project's own build and lint commands from AGENTS.md, and show the
   output.
5. Advance the scope entry to reflect what is now true.

## When the build reveals a design gap

Stop rather than inventing. A gap discovered mid build is the same owed decision
the gate is for, and quietly picking an answer at this point is how a project
ends up with load bearing choices nobody remembers making.

## Completion report

Lead with what was built and whether it runs. Name which acceptance criteria are
met and which are not. Point to the files. Report anything assumed under its own
heading, because that is the part a person has to rule on.
