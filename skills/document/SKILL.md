---
name: document
description: Run /document `pr` | `changelog` | `release-note` | `postmortem` (or let it ask) to write the human facing prose about a change. Drafts from the real commits and diff, writing to the right place for the type. Does not write code, tests, or specs.
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: [pr | changelog | release-note | postmortem]
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

Writes the prose a person reads about a change: the PR body, the changelog
entry, the release note, the postmortem. Drafted from the real commits and the
real diff, never from the conversation that produced them.

That distinction is the whole point. A chat log records what was intended. The
diff records what shipped, and those differ more often than anyone expects.

## Determine the type

- **An explicit type**, use it.
- **No type**, ask. Do not guess: the four have different readers, and a release
  note written as a changelog is useless to both.

| Type | Reader | Goes to |
|------|--------|---------|
| `pr` | the reviewer | the PR body |
| `changelog` | a developer upgrading | `CHANGELOG.md` |
| `release-note` | a user | `docs/releases/<version>.md` |
| `postmortem` | the team, later | `docs/postmortems/<date>-<slug>.md` |

## Artifact ownership

Owns the four document types above. Never writes code, tests, or specs.

## Execution

1. Read the actual change: the commit range, the diff, and the spec if one
   exists. Anything you describe has to be visible in one of those.
2. Write from the template for the type, in this skill's `templates/` folder.
3. Write for that document's reader. A user reading a release note does not care
   which module changed; a reviewer reading a PR body cares about little else.
4. Say what changed and what it means for the reader. Not how hard it was.

## What not to claim

Do not describe a behavior the diff does not show. Do not claim a fix was
verified unless a run proves it. Do not list a breaking change as a minor one
because it reads better.

An empty section is better than a padded one. If there are no breaking changes,
the honest line is that there are none.

## Completion report

Lead with what was written and where. For a PR body, print it so it can be
pasted. Do not restate the document you just wrote.

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
