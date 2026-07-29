---
name: sync
description: "Run /sync as the last step after a change is complete, around merge, to keep durable knowledge current. Updates root and nested AGENTS.md, reconciles the scope from repo evidence, and flags specs the change made stale. Surgical edits only: it adds lines and rewrites single lines it owns, never a whole section and never curated prose."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent
argument-hint: [empty, or a path to scope the reconcile]
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

<!-- /agentic:standard -->

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
