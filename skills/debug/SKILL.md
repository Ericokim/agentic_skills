---
name: debug
description: "Run /debug to find and fix the root cause of a bug: something failing, broken, throwing, or behaving wrong, a test failing for a reason that is not obvious, or a verify run finding a failure. Runs a reproduce, localize, hypothesize, test, fix, verify loop, makes the minimal fix, and hands a regression test to /test. No features, no extra refactors."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent
argument-hint: [the symptom, error, or failing test]
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: off
  done: checklist
---

<!-- agentic:standard 1.0.0 -->

## Evidence classification

Tag every factual claim you make about this codebase or this change with how you
obtained it. An untagged claim is not a claim, it is a guess wearing a claim's
clothes.

- `[O] Observed`, you ran it and are quoting the result. Requires the exact
  command and its verbatim output. Paraphrased output is not Observed.
- `[D] Derived`, you read the source and concluded it. Requires a
  `file:line` citation for every claim.
- `[A] Assumed`, you inferred it and have not checked. Must be phrased as an
  assumption, never as a statement of fact.

Never upgrade a tag. If you did not run it, it is not `[O]`, however confident
you feel. If you cannot back a claim at any tier, say you do not know.

Strict: every claim in a report, summary, or completion message carries a tag.
One untagged claim blocks the whole report.

## Anti-hallucination rules

These override any instinct to be helpful by filling in a gap.

1. Never state that a file, function, flag, API, package, or config key exists
   until you have read it. Read first, then describe.
2. Never report the result of a command you did not run. "The tests pass" is a
   claim about an event; if the event did not happen, you cannot make the claim.
3. Cite `file:line` when describing existing behavior. If you cannot produce a
   citation, you are recalling, not reading.
4. Do not invent version numbers, option names, error messages, or output. Look
   them up, or mark them `[A]` and say so.
5. "I do not know" and "I could not verify this" are complete answers. An
   invented answer is worse than no answer, because it costs someone the time to
   discover it was wrong.
6. When a tool result contradicts your expectation, the tool is right. Correct
   the claim; do not explain the result away.

## Test driven development

Write the test before the code it tests.

1. **Red**, write one failing test for the next behavior. Run it. Show the
   failure as `[O]` evidence. A test you have not watched fail proves nothing:
   it may pass for the wrong reason, or not be running at all.
2. **Green**, write the least code that makes it pass. Run it. Show the pass as
   `[O]` evidence.

Rules:
- Never write implementation code before a failing test exists for it.
- Never edit a test to make a failing implementation pass. Fix the code, or say
  plainly that the test was wrong and why it was wrong.
- A skipped, pending, or commented out test is a failing test.

<!-- /agentic:standard -->

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

<!-- agentic:standard 1.0.0 -->

## Definition of done

Do not report this work as done, complete, fixed, working, or passing until
every line below holds. Check them in order and report the first that fails.

- [ ] Every acceptance criterion has `[O]` evidence: the command that proves
      it, and that command's verbatim output.
- [ ] No `[A]` claim appears in the completion report. Assumptions are either
      resolved or raised as open questions, never buried in confident prose.
- [ ] The full test suite was run, not only the new tests, and its output is
      shown.
- [ ] Every review finding is resolved, or deferred with a stated reason.
- [ ] Anything skipped is named as skipped, with what was skipped and why.

If a box cannot be ticked, say which one and why. Partial work reported
honestly is a good outcome. Complete sounding prose over unverified work is not,
and it costs the reader more than saying nothing would have.

<!-- /agentic:standard -->
