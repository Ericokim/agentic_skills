# Spec: project context and implementation prompts

**Status:** Proposed
**Feature:** context generation and prompt first execution
**Date:** 2026-07-29

> Design only. Nothing is built.

## The problem

Installing skills gives a project capability without context. `/develop` knows
how to build a feature but not which framework this repo uses, `/test` does not
know the test command, and `/check verify` does not know how to start the app.

Two artifacts close that gap:

1. **`AGENTS.md`**, the durable context every skill reads.
2. **A prompt file per request**, the execution contract a person approves
   before any code is written.

## The decision

**Generate both, from evidence, with every generated value verifiable.**

`AGENTS.md` is assembled from a section registry rather than a fixed template.
A deterministic profile of the repository decides which of the 23 sections
exist, the CLI pre-fills every fact it can read, and the agent fills only what
needs judgment, with a citation per value that the CLI re-checks.

Prompt files become a mode of the `develop` skill rather than a tenth skill,
because the artifact they produce is an implementation contract and `develop` is
what implements.

## Part 1: how `AGENTS.md` gets generated

### Which skill owns it, and how a user triggers it

**`audit`**, which already owns AGENTS.md. No new command and no second writer.

```
/audit                  whole repo
/audit src/auth         one area, its own nested AGENTS.md
```

Nothing about the trigger changes. What changes is what `audit` produces: today
it writes a hand shaped file, and under this spec it drives the pipeline below.

The CLI half is available on its own for scripting and for CI, and is what
`audit` calls when `agentic` is on the path:

```
agentic profile         print the detected profile and its evidence
agentic context --plan  select sections, pre-fill, emit the draft and brief
```

If `agentic` is not available, `audit` performs the profiling itself and says in
its report that detection was not verified by the CLI.

### The pipeline

```
  1  profile     CLI      read the repo, record every signal with its evidence
  2  select      CLI      registry predicates decide which sections exist
  3  pre-fill    CLI      write every fact the repo already states
  4  brief       CLI      emit AGENTS.draft.md plus the list of open placeholders
  5  fill        agent    inspect source, answer each placeholder with a citation
  6  verify      CLI      re-read each citation, downgrade what does not resolve
  7  emit        CLI      write AGENTS.generated.md and a diff against any existing file
  8  review      person   read the diff, accept or reject
```

Steps 1 to 4 and 6 to 7 are deterministic. Only step 5 involves a model, and
only for values a repository cannot state about itself.

### Step 1: profile

Every signal carries the file that produced it, so the profile can be shown for
confirmation and every later decision traced back.

| Signal | Read from |
|---|---|
| Languages, package manager | manifests, lockfiles |
| Frameworks and versions | dependencies, config files |
| Database | migrations, ORM config, connection environment variables |
| HTTP routes | route directories, server framework, OpenAPI documents |
| Background work | schedulers, queues, cron, worker entry points |
| User interface | component directories, view framework |
| Browser tooling | Playwright, Cypress, or an equivalent in dependencies |
| Secrets and roles | environment files, auth middleware, role enums |
| Tests | test directories, runner config, CI workflows |
| Commands | package scripts, Makefile, Taskfile, CI workflows |
| Workflow skills | `skills.lock` |
| Library skills | `.claude/skills/`, `.agents/skills/` |

### Step 2: select, all 23 sections

Each section owns its template text and its predicate in one file under
`src/context/sections/`, the same shape as a rule family in `src/standard/`, so
text and applicability cannot drift apart, and the registry is testable the way
the standard is: pure functions over strings, no filesystem needed.

| # | Section | Included when |
|---|---|---|
| 1 | Product | always |
| 2 | Workflow | always |
| 3 | Skills | always |
| 4 | Prompt files | always |
| 5 | Architecture | always |
| 6 | Tech stack | always |
| 7 | Data platform source of truth | database |
| 8 | Process source selection | background work + database |
| 9 | Process model and pipeline | background work + database |
| 10 | Primary record storage rules | database |
| 11 | Input discovery and extraction | background work |
| 12 | Candidate filtering | background work + database |
| 13 | Record validation and cleanup | database |
| 14 | API route method rules | HTTP routes |
| 15 | Privileged and secret access | secrets or roles |
| 16 | Manual run behaviour and logs | background work |
| 17 | Testing output after implementation | always |
| 18 | Scheduler or background system | background work |
| 19 | Domain processor and UI representation | UI + a domain model |
| 20 | Advanced capability | detected, otherwise omitted |
| 21 | Security, code standards, final rule | always |
| 22 | Commands and checks | always |
| 23 | Visual testing with browser agents | UI + browser tooling |
| + | Definition of done, completion report, operating sequence | always |

Fourteen blocks are always present, fourteen are conditional. A CLI selects 14,
a web application with a database 20, a pipeline application all 28.

**Nothing is lost.** A section that does not apply is absent rather than filled
with `Unknown`, and the run reports which sections were skipped and on what
evidence.

### Step 3: one flat file

`AGENTS.md` is a single file. No spine, no `.agents/context/` split, no
pointers to follow.

A tiered split would cut the always loaded size further, but it costs a reader
the ability to open one file and see the whole contract, and it makes every
skill's "read AGENTS.md" instruction only partly true. One file is worth the
tokens.

The saving therefore comes entirely from section selection, not from deferring
anything to a second file. Measured from a full template totalling 29,256 bytes
across 28 blocks:

| Project shape | Blocks | Size | Tokens per session | Against a flat 23 section file |
|---|---|---|---|---|
| CLI or library | 14 | 13.1 KB | ~3.3k | 59% smaller |
| Web application with a database | 20 | 19.9 KB | ~5.0k | 38% smaller |
| Pipeline application | 28 | 29.3 KB | ~7.3k | 9% smaller |

**State the cost honestly.** A pipeline application still pays roughly 7.3k
tokens on every turn, because a project that genuinely needs 28 sections needs
them in the file every skill reads. Section selection helps most where it should:
a small project stops carrying rules about a pipeline it does not have.

If that cost proves unacceptable in practice, the lever is shortening sections,
not splitting the file. The budget mechanism already used for skills applies
here: report the size on every generation, and treat growth as a reason to
prune.

### Step 5: what the agent fills, and how

The brief from step 4 lists each open placeholder, what kind of evidence would
answer it, and where to look. The agent answers in this form:

```
PRODUCT_SUMMARY: a content management system for university course material
  evidence: README.md:1-14, apps/web/app/courses/page.tsx:1
```

A value with no citation is not accepted.

### Step 6: verification

| Mechanism | How | Catches |
|---|---|---|
| **Constrain before** | Facts the CLI can read are pre-filled and never offered to the agent | Invention, by removing the opportunity |
| **Verify after** | Each citation is re-read and the claimed value confirmed present. Failure rewrites the field to `Unknown` | Fabricated facts, stale citations |
| **Instruct** | Anti-hallucination prose in the template itself | Some of the rest |

Roughly 60% of a full template's placeholders are facts already sitting in
manifests, lockfiles, CI configs, and `skills.lock`.

Fixed arity placeholders are removed. Ten numbered feature slots create pressure
to invent six features when a project has four. Lists are variable length.

**The residual, stated plainly.** Verification catches fabricated facts. It
cannot catch a plausible but wrong summary: "a CMS for schools" when the project
serves hospitals. Only a person reading the diff catches that.

### Step 7: never overwrite

An existing `AGENTS.md` is never modified. The run writes `AGENTS.generated.md`
plus a comparison, preserves curated prose, and reports contradictions instead
of resolving them.

## Part 2: how prompt files get generated

### Which skill owns it

**`develop`**, as a mode. Not a tenth skill: `architect` already writes the
decision as a spec, and a prompt file is the execution contract for one request
against that decision. Putting it in the skill that implements keeps one owner
for the question "what am I about to do".

### How a user triggers it

**Opt in, never the default.** A one line change should not cost an approval
round trip, and a workflow that always stops to ask is one people learn to skip.

Two levels, matching how `check` already routes on a leading mode word:

| Level | How | Effect |
|---|---|---|
| Per request | `/develop prompt <request>` | This one request runs prompt first |
| Per project | `"promptFirst": true` in `skills.json` | Every `/develop` runs prompt first, and `/develop now <request>` skips it once |

```
/develop prompt add rate limiting to the login route
```

`develop` routes on the first word, the same way `/check verify` and
`/check review` do. A bare `/develop <request>` keeps today's behaviour: build
against the spec, no prompt file, no approval pause.

When the project default is on, the generated `AGENTS.md` section 2 says so, so
a newcomer reads the rule rather than discovering it.

**Ambiguity.** A feature genuinely named `prompt` collides with the mode word.
`develop` resolves it the way `check` does with a bare invocation: it does not
guess, it asks which was meant.

### The flow

`/develop <request>` in prompt first mode:

| Step | Action |
|---|---|
| 1 | Read `AGENTS.md` |
| 2 | Read the skills the user named |
| 3 | Read clearly needed supporting skills from the approved list |
| 4 | Inspect relevant code, tests, config, types, schemas, docs |
| 5 | Classify every material finding as `Confirmed`, `Inferred`, `Unknown`, or `Proposed` |
| 6 | Ask a focused question only where evidence cannot resolve real ambiguity |
| 7 | Write `prompts/NNN-slug.md` |
| 8 | Map every acceptance criterion to a test or an explicit verification step |
| 9 | Ask: `I prepared the implementation prompt at prompts/NNN-slug.md. Is this good to execute?` |
| 10 | On approval, re-read the approved file and implement strictly to it |
| 11 | Show the RED state where TDD applies |
| 12 | Implement only the approved scope |
| 13 | Show GREEN with targeted tests |
| 14 | Refactor only while tests stay green |
| 15 | Run the available checks |
| 16 | Inspect the complete diff |
| 17 | Independent review for meaningful changes |
| 18 | Share the exact steps to run the finished feature |

Three standing rules:

- Do not code before the prompt exists, unless the user says to skip it.
- Do not weaken, delete, or skip tests to obtain a passing result.
- Do not claim completion because an interface appears to work.

### How this relates to the existing standard

Steps 5, 11 to 14, and 17 are the standard's families already: evidence
classification, the red green loop, independent review. Prompt first mode does
not add a second discipline, it sequences the one already compiled into every
skill. The vocabularies map directly:

| Prompt file | Standard |
|---|---|
| `Confirmed` | `[O]` Observed |
| `Inferred` | `[D]` Derived |
| `Unknown` or `Proposed` | `[A]` Assumed |

Two names for one idea is a duplication to remove during implementation: the
prompt template should use the tags the skills already inject.

### Section 2 of the generated AGENTS.md

Adaptive, so the context file never competes with the installed skills:

- **agentic skills installed:** section 2 names `/scope`, `/architect`,
  `/develop`, `/check`, and describes prompt first mode as how `develop` runs.
- **No agentic skills:** section 2 emits the 18 step flow above as a self
  contained process.

## Acceptance criteria

- [ ] A repository with no database, no background work, and no UI selects
      exactly the 14 always blocks, and the output contains no `Unknown` from a
      skipped section.
- [ ] A repository with a database, background work, a UI, and browser tooling
      selects all 28 blocks.
- [ ] Every profile signal reports the file that produced it.
- [ ] `AGENTS.md` is one file. The run writes no companion context directory.
- [ ] Every generation reports the resulting size in bytes and an approximate
      token count, so growth is visible.
- [ ] Versions, commands, dependencies, and installed skills match the manifests
      and `skills.lock` exactly, with no model involvement.
- [ ] An agent filled value whose citation does not resolve is emitted as
      `Unknown`, and the run reports how many fields were downgraded.
- [ ] An existing `AGENTS.md` is never modified; the run writes
      `AGENTS.generated.md` and prints a comparison.
- [ ] Running twice on an unchanged repository produces byte identical output.
- [ ] A repository with too little evidence produces an always blocks only file
      naming which sections were skipped and why.
- [ ] `/develop prompt <request>` writes `prompts/NNN-slug.md` and stops for
      approval before editing any file.
- [ ] A bare `/develop <request>` writes no prompt file and does not pause,
      matching today's behaviour.
- [ ] With `"promptFirst": true` in `skills.json`, a bare `/develop <request>`
      runs prompt first, and `/develop now <request>` skips it for one run.
- [ ] Every acceptance criterion in a generated prompt names a test or an
      explicit verification step.
- [ ] Declining the approval question leaves the working tree unchanged.
- [ ] With agentic skills installed, generated section 2 names the skills;
      without them it contains the full flow.

## Where every value comes from

| Value | Source | Filled by |
|---|---|---|
| Framework versions | manifests, lockfiles | CLI |
| Commands | package scripts, Makefile, CI | CLI |
| Whether commands pass | running them | agent |
| Workflow skills | `skills.lock` | CLI |
| Library skills | skills directories | CLI |
| Architecture boundaries | directory layout | CLI proposes, agent confirms |
| Product summary | README, or the user | agent, cited |
| Out of scope | the user | agent, asked |
| Conventions | reading source | agent, cited |
| Domain and pipeline rules | reading source | agent, cited |
| Prompt acceptance criteria | the request plus the spec | agent |

## Surfaces to build

- A profiler returning signals with their evidence.
- A section registry under `src/context/sections/`, one file per section, each
  owning its text and its predicate.
- An assembler that selects sections, orders them, and pre-fills every
  deterministic field.
- A brief writer listing open placeholders and where to look.
- A citation verifier that downgrades what does not resolve.
- A comparison writer for the existing file case.
- A prompt template and numbering scheme for `prompts/`.
- Changes to `audit` to drive context generation.
- Changes to `develop` to add prompt first mode.

## Open questions

- **Does the template version move with `STANDARD_VERSION`** or carry its own?
- **What is a sensible size ceiling for a generated `AGENTS.md`**, and should
  breaching it be a warning or a refusal?
- **Should `agentic init` offer to turn `promptFirst` on**, or is editing
  `skills.json` enough?

## Out of scope

- Replacing the `architect` spec gate. Prompt first mode sits after the decision
  exists, not instead of it.
- Any judgment about whether generated text is good. Coherence with evidence is
  checkable, quality is not.
