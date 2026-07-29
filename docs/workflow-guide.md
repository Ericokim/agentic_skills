# Workflow guide

The deep dive: what each skill does, which files carry the work, who is allowed
to change what, and one idea followed from scope to shipped.

The README has the short version and a use case per skill. This is the rest.

## The idea

State lives in files, not in a chat session. A scope, specs, AGENTS.md, tests,
and review findings are all on disk, so work survives a closed session, a new
machine, and a different person. Each skill suggests clearing the session at
handoffs, because the next skill reads from disk anyway and a long chat is a
recurring cost with no benefit.

```
idea → /scope → /audit → /architect → /develop → /check verify → /test → /check review → /document → /sync
```

That is an order, not a track. Run only what a change needs. A typo fix is
`/develop`. A bug is `/debug`. A new product is the whole chain.

## Who owns what

Ownership is the rule that keeps skills from fighting each other. One writer per
artifact.

| Artifact | Path | Written by | Maintained by |
|---|---|---|---|
| Scope | `docs/scope/` | scope | scope, sync |
| Specs | `docs/specs/` | architect | architect (status: sync) |
| Context files | AGENTS.md, thin CLAUDE.md pointer | audit | sync |
| Application code | your source tree | develop, debug | |
| Tests | your test directories | test | |
| Review findings | `docs/reviews/` | check | |
| Human docs | PR body, CHANGELOG.md, `docs/releases/`, `docs/postmortems/` | document | |

If `docs/` publishes as a site, these move to `.workflow/` so internal planning
does not ship to users.

## The acceptance criteria thread

One thing ties every stage together. `/architect` writes acceptance criteria
into the spec. `/develop` builds to them. `/check verify` proves each one against
the running application. `/test` turns them into the first tests. `/document`
describes what they delivered.

That thread is why the spec matters more than any other artifact. Without it,
each later stage invents its own idea of what "working" means, and they quietly
disagree.

## The spec gate

`/develop` asks one question before writing code: would building this mean
inventing a load bearing decision that no spec records? If yes, it stops and
routes to `/architect`.

A decision is load bearing when changing it later means changing code in many
places: a stack, a data model, a provider, an auth boundary. Cheap to reverse
means it does not need a spec.

You can override the gate. The override is honored and it is not free: the
assumption is written as an `Assumed` spec and flagged on the feature until
`/architect` ratifies it. The flag never blocks declaring the feature done. It
exists so that a decision made under time pressure is recorded somewhere other
than a chat log nobody will reread.

The gate is layered, not magic. `/architect` names the source of every value the
feature must produce, so gaps surface at design time. `/develop` checks that
coverage again before building. At higher depths, `/architect` offers an
independent read of the spec. Together these catch most of it. Behavioral
correctness is caught later, by `/check verify` and `/test`.

## Workflow depth

At the end of `/scope` you pick a depth for the project, overridable per feature:

| Depth | Suggested tail after `/develop` |
|---|---|
| `Prototype` | nothing, self checked, for throwaway work |
| `Alpha` | `/check verify` |
| `Beta` | adds `/test` |
| `GA` | adds `/check review` and `/document` |

This is a suggestion, never a track you are locked onto. Every step after
`/develop` is skippable, and `done` is yours to declare, never a status a skill
withholds until boxes are ticked. A skipped step is recorded as skipped rather
than quietly counted as complete.

The one thing the workflow asks, at every depth, is that a load bearing decision
gets written down. Even that is flagged, not enforced.

## The engineer decides

Any check the AI initiates is offered, never run or skipped on your behalf.
Whatever it finds, a gap or a fix, is surfaced for you to decide rather than
silently applied. A check you invoke directly is already your choice to run, and
it still reports rather than auto fixing.

Every user facing question carries exactly one recommended option and a one line
reason. Never a neutral menu, never a cold question, never a silent decision.

## One idea, all the way through

**The idea.** "A tool that turns podcast episodes into searchable transcripts."

**`/scope`** asks what the first useful slice is. A skateboard: paste one URL,
get a transcript you can search. Not accounts, not a library, not billing. It
writes `docs/scope/` with four features in order and sets depth to Beta.
Out of scope names the things deliberately not built, which is the section that
stops the same argument recurring in three weeks.

**`/audit`** is skipped: the project does not exist yet, so there is nothing
true to write down. Writing AGENTS.md now would record intentions as facts.

**`/architect`** takes the first load bearing decision: which transcription
service, and where transcripts live. It asks one question at a time, recommends
a managed API over self hosted with the reason (cost of operating a GPU is not
the problem being solved), and writes `docs/specs/0001-transcription.md` with
six acceptance criteria and a table naming the source of every value.

The project is scaffolded. Now **`/audit`** runs, reading a real project, and
writes AGENTS.md with the actual commands, having run them to check they work.

**`/develop`** builds the ingest path from the spec. It hits the spec gate once:
the spec did not say what happens to an episode over the API's length limit.
That is load bearing, so it stops. A two minute `/architect` conversation adds
the criterion, and the build continues.

**`/check verify`** starts the app and pastes a real URL. Five criteria pass.
The sixth, an error message on an unreachable feed, shows a stack trace instead.
That is a FAIL, and it goes to `/debug`.

**`/debug`** reproduces it, localizes to an unhandled rejection in the fetch
wrapper, fixes the one line, and pins it with a regression test checked in both
directions.

**`/test`** writes the suite for the whole slice: happy path, boundaries (empty
feed, one episode, a very long episode), error states, and keyboard access on
the search field. Full suite run, output shown.

**`/check review`** runs on a fresh reader. Three findings: one real (the
transcript cache key does not include the model version, so changing models
serves stale text), two style opinions labeled as opinions. The real one is
fixed.

**`/document pr`** writes the PR body from the diff, including how it was
verified and what was deliberately left out.

**`/sync`** updates AGENTS.md with the new dependency and the new command,
moves the scope entry to `done`, and flags nothing stale.

Total specs written: two. Total decisions recorded that would otherwise have
lived only in a chat log: two. That is the point of the whole exercise.

## On existing codebases

Run `/audit` first, so every later skill understands the project. Then `/scope`,
which enrolls what already exists before planning anything new. Then the feature
loop as normal.

The order matters. `/scope` on an unaudited codebase plans against a project it
has not read.

## In a monorepo

Everything scopes to the target workspace. Each workspace has its own nested
AGENTS.md with its own commands, its own scope, and its own stack. A single root
context file describing five packages describes none of them.
