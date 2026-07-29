---
name: check
description: "Run /check before merge to confirm a change is sound. Two modes: `/check verify` drives the real app and proves behavior against the spec; `/check review` runs a senior code review on a different model than wrote the code. Verify after /develop, review before a PR. Writes findings to docs/reviews/, and never edits your code."
allowed-tools: Bash, Read, Grep, Glob, Write, Agent
argument-hint: "[verify | review | both]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: off
  review: independent
  done: checklist
---

## What this skill does

Confirms a change before merge, two different ways. They are separate jobs and
you usually run both, verify first.

- **verify**, runtime proof: drive the real application and watch the change
  behave. Proves the feature works and matches the spec, which green tests never
  reveal on their own.
- **review**, a rigorous senior read of the diff by a reviewer that did not
  write the code.

Neither mode edits code. Verify points failures at `/debug` or `/develop`.
Review reports findings for the implementer to fix.

## Pick the mode first

Before reading a mode file or touching the repo, look at what followed `/check`:

- Starts with **verify** or **run**, read `modes/verify.md` and follow it.
- Starts with **review**, read `modes/review.md` and follow it.
- **Anything else**, including a bare `/check` or a feature name with no mode,
  do not guess and do not default. Print the panel below and wait.

```
Which check do you want to run? Type one:
  verify  run the real app and prove the change works against its spec
  review  a fresh reader on the diff, findings ranked by severity
  both    verify first, then review
```

Use a typed choice shown inline rather than an interactive picker, so it behaves
the same in every agent tool. If a feature name came with no mode, carry it
through as the target once the mode is chosen.

If the engineer types **both**, verify first and only then offer review.

## Artifact ownership

Owns `docs/reviews/`. Read only on everything else, including your code.

## Portability

Any agent tool, on any operating system. `git` is the only required command.
Shell snippets in the mode files are reference, not literal scripts: use your
own file, process, and browser capabilities and apply the branching yourself.

Where a mode calls for a second reader and no way exists to spawn one, run the
work inline and say plainly in the report that the review was not independent.
That sentence is the finding.

## Completion report

Lead with the verdict: PASS or FAIL, and the one thing that decides it. For
verify, name which acceptance criteria were proven and which were not. For
review, give the count by severity and point at `docs/reviews/`. Do not reprint
a checklist of things that were fine.
