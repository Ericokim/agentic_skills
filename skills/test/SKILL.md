---
name: test
description: "Run /test to write a test suite for code you just built or changed, after a feature, route, or fix. Targets uncommitted changes automatically, reads and saves your framework choice, and picks the right strategy per file: happy path, boundaries, error states, accessibility. Writes tests, never production code."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: "[feature or path, or empty for uncommitted changes]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green-refactor
  review: off
  done: checklist
---

## What this skill does

Writes a senior test suite for a change, then proves the suite runs.

It writes tests only. When a test fails because the code is wrong, that is a
finding to report, not a reason to edit the code.

## Target

- **A feature name or path**, test that.
- **Nothing**, test the uncommitted change set. This is the common use.

If the change set is empty, say so and stop rather than inventing a target.

## Pre-flight

Find the project's test framework, runner command, and layout from AGENTS.md or
the package manifest. Do not assume a framework from the language. If none is
configured, ask once, recommend the one that fits the stack, and save the answer
so nobody is asked twice.

## Asks vs acts

Act without asking on what to test and how to structure it. Ask only when no
framework exists yet.

## Artifact ownership

Owns test files and the saved framework preference. Never edits production code.

## Execution

1. Read the diff, and the spec's acceptance criteria if one exists. The criteria
   are the first tests to write.
2. For each changed unit, pick the strategy that fits it rather than applying
   one uniformly:
   - **happy path** for the behavior it exists to provide
   - **boundaries** for empty, one, many, maximum, and just past it
   - **error states** for what it does when a dependency fails, and whether the
     failure surfaces or is swallowed
   - **accessibility** for user interface work: reachable by keyboard, labelled
     for a screen reader, focus handled
3. Write each test to fail first for the right reason, then pass.
4. Run the full suite, not only the new tests. A new test that passes while it
   breaks three others has not been shown to work.
5. Report the run verbatim.

## Tests that would pass on broken code

The failure mode worth guarding against is a suite that is green and proves
nothing: assertions that restate the implementation, mocks that make the thing
under test disappear, snapshots taken from output nobody read.

If you cannot write a test that would fail when the behavior breaks, say so.
That is a real finding about the design, and it is more useful than a test that
looks like coverage.

## Completion report

Lead with the count and the run result. Name any behavior you could not test and
why. If a test fails because the code is wrong, say that plainly and point it at
`/debug`.
