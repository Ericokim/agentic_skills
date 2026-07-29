---
name: check
description: "Run /check before merge to confirm a change is sound. Two modes: `/check verify` drives the real app and proves behavior against the spec; `/check review` runs a senior code review on a different model than wrote the code. Verify after /develop, review before a PR. Writes findings to docs/reviews/, and never edits your code."
allowed-tools: Bash, Read, Grep, Glob, Write, Agent
argument-hint: [verify | review | both]
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

## Independent review

Before this work can be called done, the change is read by a reviewer that did
not write it.

- **Independent means independent.** Spawn a reviewer with a fresh context and
  set its model explicitly rather than inheriting the session's. A model
  reviewing its own output shares its own blind spots.
- The reviewer reads the diff and the acceptance criteria, and **reports**. The
  reviewer does not edit code.
- Findings come back ranked by severity, each with a `file:line` and a concrete
  failure scenario (inputs, then the wrong result). A finding with no failure
  scenario is a style opinion; label it as one.
- The author resolves every finding or records an explicit, reasoned deferral.
  Silently dropping a finding is not resolution.

<!-- /agentic:standard -->

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
