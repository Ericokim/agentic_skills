---
name: test
description: "Run /test to write a test suite for code you just built or changed, after a feature, route, or fix. Targets uncommitted changes automatically, reads and saves your framework choice, and picks the right strategy per file: happy path, boundaries, error states, accessibility. Writes tests, never production code."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: [feature or path, or empty for uncommitted changes]
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green-refactor
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
3. **Refactor**, with tests green, remove duplication and improve names,
   rerunning the suite after each change. Behavior does not change here.

Rules:
- Never write implementation code before a failing test exists for it.
- Never edit a test to make a failing implementation pass. Fix the code, or say
  plainly that the test was wrong and why it was wrong.
- A skipped, pending, or commented out test is a failing test.

<!-- /agentic:standard -->

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
