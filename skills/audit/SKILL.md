---
name: audit
description: Run /audit on a greenfield project, an existing codebase with missing docs, or one area (/audit src/auth) to bootstrap the AI context every later skill reads. Writes tool agnostic AGENTS.md plus thin CLAUDE.md pointers, adding only what is missing. Never overwrites curated content.
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: [path to one area, or empty for the whole repo]
standard:
  evidence: strict
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

Writes the context files that give every other skill this project's stack,
commands, and conventions. AGENTS.md is canonical because every agent tool reads
it; CLAUDE.md is a thin pointer to it, never a second copy.

Everything it writes is read off the real repository. This skill is the one most
able to poison every later skill with a confident guess, so a claim it cannot
back does not go in the file.

## Route first

- **A path** (`/audit src/auth`), audit that area and write a nested AGENTS.md.
- **No argument, and the repo has source**, audit the whole repo, filling gaps.
- **No argument, and the repo is nearly empty**, this is greenfield. Say so and
  stop: the stack has to be chosen (`/architect`) and the project scaffolded
  before there is anything true to write down.

That last case matters. An AGENTS.md written for an empty project describes
intentions as if they were facts, and every later skill then believes them.

## Acts vs asks

Act without asking when adding a section that does not exist. Ask before
changing any line a person wrote.

Never overwrite curated prose. Add what is missing, and where the repo
contradicts an existing line, report the contradiction rather than silently
resolving it.

## Artifact ownership

Owns AGENTS.md at the root and in subdirectories, plus the thin CLAUDE.md
pointer. Writes nothing else. `/sync` keeps these current afterwards.

## Execution

This is a two phase flow, and the second phase is where the CLI, not this
skill, decides whether an answer stands.

1. Run `agentic context` if the command exists. It profiles the repository,
   selects the sections this project needs, pre-fills every fact the repo
   already states, and writes `AGENTS.draft.md` plus `AGENTS.brief.md`.
   If the command is missing, do the same work by hand and say so in the report.
2. Read `AGENTS.brief.md`. It lists every placeholder that still needs an
   answer and names the section each belongs to.
3. Answer each one from evidence, as a JSON object shaped exactly like this,
   one entry per placeholder name:

   ```json
   {
     "PRODUCT_SUMMARY": {
       "value": "a content management system for course material",
       "evidence": ["README.md:1-14"]
     }
   }
   ```

   A claim you cannot cite is written with `"value": "Unknown"` and no
   evidence, never guessed. Write this object to a file, for example
   `answers.json`.
4. Run the project's build and test commands, and record whether they currently
   pass. A command written down that does not run is worse than no command,
   because every later skill will try it.
5. Run `agentic context --answers answers.json`. The CLI does not take any
   answer's word for it: it re-reads every citation itself, and a value
   survives only when the file it names still contains it. Never write
   `AGENTS.md` directly, and never hand edit `AGENTS.generated.md` to restore
   a value the CLI rejected.
6. Read the CLI's report in full. A field it downgraded to `Unknown` means the
   claim could not be backed by its citation: re-answer that field with a
   better citation, or leave it `Unknown` for a person to close. Do not report
   this run as clean while any field was downgraded; the CLI itself exits non
   zero in that case.
7. The report already compares `AGENTS.generated.md` against any existing
   `AGENTS.md`, including anything the generated version would lose. Read
   that comparison rather than diffing the two files by hand.
8. In a monorepo, repeat per workspace. A single root file describing five
   packages describes none of them.

## What goes in AGENTS.md

Stack and versions. The exact commands. Layout and where things live.
Conventions a newcomer would get wrong. Known rough edges. Nothing else: this
file loads into an agent's context repeatedly, so every line is a recurring
cost.

## Completion report

Lead with what was written and the one thing that still needs a human answer.
Name the files. List anything recorded as unknown, because that is the list of
questions only a person can close.

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
