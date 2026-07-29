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

## Prompt first mode

Off by default. A one line change should not cost an approval round trip.

Turn it on for one request with a leading mode word, or for the project with
`"promptFirst": true` in `skills.json`:

- `/develop prompt <request>` runs this mode once.
- With the project setting on, a bare `/develop` runs this mode, and
  `/develop now <request>` skips it once.

If the first word is `prompt` and it is also a plausible feature name, do not
guess. Ask which was meant.

When the mode is on, before editing any file:

1. Read AGENTS.md, then the skills the user named, then the supporting skills
   the task clearly needs.
2. Inspect the relevant code, tests, config, types, schemas, and docs.
3. Tag every material finding `[O]`, `[D]`, or `[A]`.
4. Ask a focused question only where evidence cannot resolve real ambiguity.
5. Write `prompts/NNN-slug.md` from `prompt-template.md` in this skill's folder,
   numbering from the highest existing file plus one.
6. Give every acceptance criterion a test or an explicit verification step.
7. Ask: `I prepared the implementation prompt at prompts/NNN-slug.md. Is this
   good to execute?` Then stop and wait.
8. On approval, re-read the file and build strictly to it. On refusal, change
   nothing.

Do not weaken, delete, or skip a test to get a passing result. Do not claim
completion because an interface appears to work.

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
