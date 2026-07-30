---
name: scope
description: "Run /scope to turn a product idea into a living, coarse scope in docs/scope/ and keep it current: plan a new product, plan the next slice, enroll one named feature, or run bare to reconcile after shipping and queue what is next. Fixes WHAT to build. /architect designs how, /develop builds it."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: [idea | feature name | empty to reconcile]
standard:
  evidence: tagged
  anti-hallucination: strict
  tdd: off
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

Turns an idea into a coarse, ordered plan of what to build, and keeps that plan
true as work ships. The scope is a living file, not a one time document.

It does not design (that is `/architect`) and does not build (that is
`/develop`). It fixes what, and in what order.

## Route first

Look at what followed `/scope`, then pick one mode. Do not guess between two.

- **A product idea in prose** and no scope exists yet, plan a new product.
- **A product idea in prose** and a scope exists, plan the next slice on top of
  what is already there.
- **One named feature** (`/scope auth`), enroll that single feature.
- **Nothing at all**, reconcile: read the repo, mark what shipped, and queue
  what is next. This is the common daily use.

If the repo has source files but no scope, say so and enroll what exists before
planning anything new. Planning on top of a codebase you have not read produces
a scope that describes an imaginary project.

## Asks vs acts

Ask before writing a scope for the first time, and before changing the order of
work already agreed. Act without asking when reconciling status from repo
evidence, because that is reading, not deciding.

Every user facing choice carries exactly one recommended option and a one line
reason. Never a neutral menu.

## Artifact ownership

Owns `docs/scope/`. Writes nothing else. Never edits specs, AGENTS.md, or code.

If `docs/` publishes as a docs site, write to `.workflow/scope/` instead so the
plan does not ship to users.

## Execution

1. Read `docs/scope/` if it exists, and the repo's AGENTS.md for stack and
   conventions. Cite what you read.
2. Establish the current truth from the repo, not from the scope file. A feature
   the scope calls `in-progress` that has no code is `queued`, and saying so is
   the whole value of reconciling.
3. Pick the shape of the first slice and name it. Use `skateboard` when the user
   needs something end to end early, `tracer-bullet` when the risk is
   integration, `facade` when the risk is the interface, `journey` when the risk
   is whether anyone wants it. Recommend one and say why.
4. Write the scope from `scope-template.md` in this skill's folder. Features are
   coarse: a name, a one line outcome, a status, and its order. Not tasks.
5. Set a workflow depth for the project, overridable per feature: `Prototype`
   (build only), `Alpha` (adds a runtime check), `Beta` (adds tests), `GA` (adds
   an independent review and written docs). This is a suggested checking tail,
   never a track anyone is locked onto.

## The engineer decides

Depth is a default, not a gate. Any step after building is skippable, and `done`
is the engineer's to declare. A skipped step is recorded as skipped, never as
complete.

The one thing this workflow asks is that a load bearing decision gets written
down as a spec. Even that is flagged rather than enforced.

## Completion report

Lead with the headline: what the scope now says and the single next action.
Point to `docs/scope/`, do not restate it. Raise blockers only when one exists.

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
