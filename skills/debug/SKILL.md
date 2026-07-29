---
name: debug
description: "Run /debug to find and fix the root cause of a bug: something failing, broken, throwing, or behaving wrong, a test failing for a reason that is not obvious, or a verify run finding a failure. Runs a reproduce, localize, hypothesize, test, fix, verify loop, makes the minimal fix, and hands a regression test to /test. No features, no extra refactors."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent
argument-hint: "[the symptom, error, or failing test]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: off
  done: checklist
---

## What this skill does

Finds the root cause of one bug and makes the smallest fix that removes it.

Root cause, not the first place the symptom is visible. A fix applied where the
error surfaced usually moves the bug rather than removing it.

## Asks vs acts

Act without asking through the whole loop. Ask only when the fix requires a load
bearing decision, which routes to `/architect`.

## Artifact ownership

Owns the fix, which is production code, and the regression test that pins it.
Nothing else. No refactoring that the fix did not require.

## Execution

### 1. Capture the symptom

Write down exactly what was observed: the command, the input, the error text
verbatim. Not a paraphrase. Half of debugging is discovering the symptom was not
quite what everyone assumed.

### 2. Reproduce reliably

Get to a command that fails every time. If it fails only sometimes, say so and
find what varies: order, timing, state, environment.

A bug you cannot reproduce cannot be shown to be fixed. If you cannot reproduce
it, stop and report that, with what you tried. That is a legitimate outcome.

### 3. Localize

Narrow to the smallest region that still fails. Bisect the input, the code path,
or the history. Report the narrowing you actually did.

### 4. Hypothesize, one at a time

State one hypothesis that would explain the symptom, and what would prove it
wrong. One at a time: changing several things at once and seeing the symptom go
away teaches you nothing about which change mattered.

### 5. Test the hypothesis

Run the thing that distinguishes it. If it survives, continue. If it does not,
say so and form the next one. A hypothesis you talked yourself into is not
confirmed.

### 6. Fix minimally

Make the smallest change that removes the cause. Resist the cleanup you can see
from here: it makes the diff harder to review and hides which line was the fix.

### 7. Verify

Reproduce again and show it now passes. Run the full suite and show it. A fix
that resolves the symptom while breaking something else is not a fix.

### 8. Pin it

Write a regression test that fails without the fix and passes with it, and check
both directions. Hand it to `/test` if the suite needs more than the pin.

## When the cause is a design flaw

Some bugs are not defects, they are a decision that was wrong. When the minimal
fix would mean inventing a load bearing decision, stop and route to
`/architect`. Patching around a design flaw buries it.

## Completion report

Lead with the root cause in one sentence and where it lives. Then the fix, then
the proof it works: the failing run before, the passing run after. Name anything
you found and deliberately did not fix.
