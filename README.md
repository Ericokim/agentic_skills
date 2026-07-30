<div align="center">

# ⚙️ Agentic Skills

### A nine skill workflow for AI coding agents, held to a standard that **compiles and refuses**

*Every skill declares the engineering discipline it commits to. A build step writes that discipline into the file. A skill whose declaration is incoherent is never published at all.*

[![check](https://github.com/Ericokim/agentic_skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Ericokim/agentic_skills/actions/workflows/ci.yml)
[![node](https://img.shields.io/badge/node-%E2%89%A520-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[![Claude Code](https://img.shields.io/badge/Claude_Code-✓-D97757)](https://claude.com/claude-code)
[![Codex](https://img.shields.io/badge/Codex-✓-412991)](https://openai.com)
[![Cursor](https://img.shields.io/badge/Cursor-partial-6E7681)](https://cursor.com)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_format-1f6feb)](https://agentskills.io)

**[Quick start](#-quick-start) · [How it works](#-what-makes-it-different) · [The standard](#-the-standard) · [Skills](#-the-nine-skills) · [Managing skills](#-managing-skills) · [FAQ](#-faq)**

</div>

---

## ⚡ Quick start

Needs Node 20+ and one agent tool. Installation is handled by the [skills CLI](https://www.npmjs.com/package/skills), which knows the paths of sixty four agent tools:

```bash
cd your-project
```

```bash
npx -y skills@latest add Ericokim/agentic_skills
```

That opens a wizard: pick the skills with the spacebar, pick your agents, pick project or global, pick symlink or copy. Then run `/audit` in your agent.

Non interactively, or in CI:

```bash
npx -y skills@latest add Ericokim/agentic_skills -a claude-code -s '*' -y
```

Every skill in this repo is committed with the standard's rule blocks already injected, so a plain copier delivers them intact. This repo builds and checks the skills; it does not reimplement installing them.

---

## 🎯 What makes it different

A skill is a prompt that ships, and it loads into context on every run. That creates two problems.

**Duplication.** Shared rules (how to cite evidence, what counts as done) have to appear in every skill, because each installed skill stands alone. The usual fix is pasting the block everywhere and linting that the copies stayed identical. Here you declare, and the compiler writes:

```yaml
# what you author                        # what gets installed
standard:                                ## Evidence classification    <- injected
  evidence: strict          ────────>    ## Anti-hallucination rules   <- injected
  tdd: red-green                         ## Test driven development    <- injected
  review: independent                    ## Independent review         <- injected
  done: checklist                        ## <your skill content>
                                         ## Definition of done         <- injected
```

**Incoherence.** A skill can promise a definition of done with no way to cite evidence, or independent review with no way to spawn a reviewer. Both look fine line by line. The build checks the combination:

```bash
agentic validate skills/
```

```text
✗ skills/liar/SKILL.md
    error standard-invariant  done requires evidence at tagged or stricter, because
                              the checklist asks for [O] evidence that an untagged
                              skill has no way to express
    error standard-invariant  review: independent requires a subagent capability, so
                              add Agent to allowed-tools (a skill cannot promise an
                              independent reviewer it has no way to spawn)
```

`build` runs the same check and writes nothing when one skill fails, so an incoherent skill never reaches the directory an installer copies from.

**Installing is rented, on purpose.** The [skills CLI](https://www.npmjs.com/package/skills) already resolves a git source, runs the selection wizard, knows the paths of sixty four agent tools, and writes a lockfile:

```bash
npx -y skills@latest add Ericokim/agentic_skills -a claude-code
```

It copies `skills/` exactly as committed, and the committed skill already carries the standard, because `agentic build` writes the injected blocks into it before every release. The copy carries one extra frontmatter key, the `standard:` declaration, which agents ignore.

What a copier cannot do is refuse. `agentic build` checks every declaration for coherence and writes nothing when one fails, so an incoherent skill never reaches a directory any installer would copy from. The check moved from install time to publish time; it did not disappear.

This repo used to ship its own installer: a git fetcher, a lockfile, eleven target adapters, and a hand rolled wizard. That was about 2,600 lines to be worse at a solved problem, so it is gone.

---

## 📐 The standard

Five rule families. Every skill declares a level for all five, explicitly. No defaults: a skill that has not said where it stands has not decided.

| Family | Levels | What it injects |
|---|---|---|
| `evidence` | `off` `tagged` `strict` | The `[O]` Observed, `[D]` Derived, `[A]` Assumed taxonomy, and what each requires as backing |
| `anti-hallucination` | `off` `strict` | Never assert a file or API exists without reading it, never report a command you did not run, cite `file:line`, "I do not know" is a valid answer |
| `tdd` | `off` `red-green` `red-green-refactor` | The loop, plus: a test you have not watched fail proves nothing |
| `review` | `off` `self` `independent` | Fresh context or different model than the author, reviewer reports and never edits |
| `done` | `off` `checklist` | Every criterion has `[O]` evidence, no `[A]` in a completion claim, skipped work named as skipped |

**Invariants** are what a per-file linter cannot catch. Each rejects a declaration that is valid line by line but incoherent as a whole:

| Invariant | Reasoning |
|---|---|
| `done` needs `evidence` at `tagged`+ | A definition of done that cannot cite evidence is decoration |
| `tdd` needs `evidence: strict` | The red step is only real if the failing run is shown |
| `review: independent` needs a subagent capability | A skill cannot promise a reviewer it has no way to spawn |

In Claude Code, `.claude/agents/` ships the `scout` and `reviewer` helpers that satisfy that last one; other clients ignore that directory.

Normative detail, and the portability rules `validate` also enforces: [`docs/standard.md`](docs/standard.md) and [`docs/authoring.md`](docs/authoring.md).

---

## 🧩 The nine skills

One skill per phase. Run only the ones a change needs, in any order.

```
idea → /scope → /audit → /architect → /develop → /check verify → /test → /check review → /document → /sync
```

State lives in files (a scope, specs, AGENTS.md, tests), not in a chat session, so work survives across sessions and people. One writer per artifact keeps two skills from fighting over the same file.

| | Skill | Phase | What it does | Owns |
|:--:|---|---|---|---|
| 🗺️ | [`scope`](#scope) | Plan | Turns an idea into a coarse, ordered plan with a depth (Prototype/Alpha/Beta/GA) that sets how much checking follows `/develop`, and keeps it true as work ships | `docs/scope/` |
| 🔎 | [`audit`](#audit) | Context | Writes the AGENTS.md context files every other skill reads | `AGENTS.md` |
| 📐 | [`architect`](#architect) | Design | Makes one load bearing decision and writes it as a spec, with acceptance criteria the rest of the loop builds to | `docs/specs/` |
| 🔨 | [`develop`](#develop) | Build | Builds a feature from its spec, routing to `/architect` for any load bearing decision no spec covers, then advances the scope | your source |
| ✅ | [`check`](#check) | Verify | Confirms a change before merge, in two modes | `docs/reviews/` |
| 🧪 | [`test`](#test) | Verify | Writes a test suite for what you just changed | your tests |
| 📝 | [`document`](#document) | Ship | Writes the human facing prose from the real diff | PR, changelog |
| 🔄 | [`sync`](#sync) | Ship | Reconciles AGENTS.md, the scope, and spec statuses | statuses |
| 🐛 | [`debug`](#debug) | Any time | Finds the root cause and makes the minimal fix | the fix |

<details open>
<summary><b>Usage and a use case for each</b></summary>

#### scope

```bash
/scope a tool that turns podcast episodes into searchable transcripts
/scope                # bare: reconcile status from the repo, queue what is next
```

> **Use case.** You shipped two features last week and cannot remember what is next. A bare `/scope` reads the repo, marks what actually landed, and tells you the next slice. It sets status from code, so a feature marked `in-progress` with nothing written gets moved back to `queued`.

#### audit

```bash
/audit                # whole repo
/audit src/auth       # one area, gets its own nested AGENTS.md
```

> **Use case.** You inherited a codebase and the agent keeps guessing the test command wrong. `/audit` reads the manifests and CI config, runs the build and test commands to check they work, and writes down what is actually true. Anything it could not verify is recorded as unknown rather than guessed.

#### architect

```bash
/architect how should sessions be stored
```

> **Use case.** You are about to build auth and have not decided between JWTs and server sessions. `/architect` asks one question at a time, recommends an answer with its reason, and writes `docs/specs/`. The decision survives the chat that produced it.

#### develop

```bash
/develop the transcript search page
/develop prompt add rate limiting to the login route   # write a prompt, wait for approval
```

> **Use case.** You ask for a checkout flow but never decided which payment provider. `/develop` stops at the spec gate and routes you to `/architect` instead of quietly picking Stripe. You can override, and the assumption gets recorded as an `Assumed` spec rather than lost.

#### check

```bash
/check verify         # drive the real app against the spec
/check review          # a fresh reader on the diff
/check                 # asks which, never guesses
```

> **Use case.** Your tests are green but you have not seen the feature work. `/check verify` starts the app and drives every acceptance criterion through the real interface. Green tests prove assertions hold; they do not prove a specced page was ever built.

#### test

```bash
/test                 # targets uncommitted changes
/test src/search       # or a path
```

> **Use case.** You just fixed a parser and want tests that would actually catch the regression. `/test` picks a strategy per file (happy path, boundaries, error states, accessibility) and runs the full suite, not only the new tests.

#### document

```bash
/document pr
/document changelog | release-note | postmortem
```

> **Use case.** You need a PR body and the branch has 14 commits with unhelpful messages. `/document pr` reads the diff rather than the commit log, and says what changed, how it was verified, and what was deliberately left out.

#### sync

```bash
/sync                  # the last step, around merge
```

> **Use case.** Your change moved a directory and added a dependency, so AGENTS.md is now subtly wrong for everyone. `/sync` adds the lines that are missing and rewrites only single lines it owns. It never touches prose a person wrote.

#### debug

```bash
/debug the search endpoint returns 500 on empty query
```

> **Use case.** A test fails for a reason nobody understands. `/debug` runs a reproduce, localize, hypothesize, test, fix, verify loop, one hypothesis at a time, then pins the fix with a regression test checked in both directions.

</details>

---

## 🧰 Managing skills

Installing, updating and removing are the [skills CLI](https://www.npmjs.com/package/skills)'s job:

| Task | Command |
|---|---|
| Install | `npx -y skills@latest add Ericokim/agentic_skills` |
| Pick agents | add `-a claude-code` (or `-a '*'` for all) |
| Pick skills | add `-s develop,check` (or `-s '*'` for all) |
| Global instead of project | add `-g` |
| Copy instead of symlink | add `--copy` |
| Skip every prompt | add `-y` |
| List what is installed | `npx -y skills@latest list` |
| Remove one | `npx -y skills@latest remove develop` |
| Restore from the lockfile | `npx -y skills@latest experimental_install` |

It writes `skills-lock.json`, recording the source and a hash per skill. Commit that, and a teammate gets what you have.

Pin a release by adding a git ref to the source: `Ericokim/agentic_skills#v0.4.0`.

### This repo's own commands

`agentic` builds and checks the skills. It does not install them.

| | Command | Does | Writes |
|:--:|---|---|:--:|
| 🔨 | `agentic build` | Regenerate the standard's blocks in `skills/` in place, refusing to write anything if a declaration fails | ✍️ |
| 🚦 | `agentic build --check` | Report what a build would change without writing, non zero when stale | 👁️ |
| ✅ | `agentic validate [path]` | Check skills against the standard | 👁️ |
| 💰 | `agentic tokens [file]` | Where the tokens went in a real session | 👁️ |
| 🔎 | `agentic profile` | Show what this project looks like, and the evidence | 👁️ |
| 📄 | `agentic context` | Plan an AGENTS.md, writing a draft and a brief | ✍️ |
| 📄 | `agentic context --answers <file>` | Verify cited answers and write `AGENTS.generated.md` | ✍️ |

<sub>✍️ writes files · 👁️ read only</sub>

| Option | Applies to | Does |
|---|---|---|
| `--answers <file>` | `context` | A JSON file of cited answers to verify |
| `--root <dir>` | all | Project root (default: working directory) |
| `--top <n>` | `tokens` | Heaviest turns to show (default 12) |
| `--project <dir>` | `tokens` | Encoded transcript directory to read |

**Exit codes:** `0` success · `1` something is wrong · `2` bad usage

Run it without cloning:

```bash
npx -y github:Ericokim/agentic_skills profile
```

`agentic validate .claude/skills` over an **installed** directory does the sensible thing: an installed skill has had its declaration stripped, so it is checked against the rules that still apply once compiled (parse, name, budget, prose) and is not asked for a declaration that is deliberately gone.

### Bundled files

A skill can ship mode files and templates beside its `SKILL.md` and reference them by relative path. `agentic validate` checks those files too, because they reach an agent the same way the skill does, and `build` holds them to the same prose and size budgets.

---

## 📄 Generating project context

Skills know how to work. `AGENTS.md` is how they learn about *your* project.

```bash
agentic profile                     # what was detected, and the file that proved it
agentic context                     # plan an AGENTS.md: draft plus a brief of what is missing
agentic context --answers <file>    # verify cited answers, write AGENTS.generated.md
```

Sections are chosen from evidence, so a library gets 14 blocks and a pipeline application gets 28; a section that does not apply is absent rather than filled with `Unknown`.

Generation runs in two phases. The first writes a draft and a brief listing what the repository could not answer for itself. An agent answers those, each with a citation, and the second phase does not take the answer's word for it: the CLI re-reads every citation itself, and a value survives only when the file it names still contains it.

```text
✗ 2 fields downgraded to Unknown - the claim could not be backed by its citation:
    ✗ OUT_OF_SCOPE: not found in README.md:3
    ✗ ARCHITECTURE_SUMMARY: no citation was given
```

A value that cannot be verified becomes `Unknown`, and the run reports every field it downgraded and exits non zero so CI can gate on it. Facts the CLI read itself are never offered to a model and never overwritten by one, so a model cannot invent a version number or a command. This is the difference between asking a model not to hallucinate and checking whether it did.

Your `AGENTS.md` is never overwritten: the run writes `AGENTS.generated.md` and shows what would change, including anything you would lose. Loading one compiled skill costs about 1.6k tokens on average, out of 56.7 KB installed across all nine; `agentic tokens` measures the real cost of a session from its transcript instead of estimating it.

---

## ✍️ Authoring a skill

```bash
agentic validate skills/         # the same code path add runs
agentic build                    # regenerate the standard blocks in place, refusing on a violation
agentic build --check            # fail if a block is stale, what CI runs
```

A green `validate` means installable. Skills live in one directory, `skills/`:
the file you author is the file an installer reads, this tool or a third
party's. You write the prose and the `standard:` declaration; `build`
regenerates the blocks between the `<!-- agentic:standard -->` markers, so the
committed skill already carries the standard even for an installer that only
copies. Conventions, budgets, and the full rule list:
[`docs/authoring.md`](docs/authoring.md).

---

## ❓ FAQ

**Troubleshooting**

| What you see | What it means | Do this |
|---|---|---|
| `does not meet the standard` | A skill's rules contradict each other | Fix the declaration; the message names the rule |
| `skills/ is stale` | A declaration changed without a rebuild, or a generated block was hand edited | `npm run build` |
| npx asks `Ok to proceed?` | You left out `-y` | Type `y`, or add `-y` |
| Agent does not see the skill | Some tools cache the skill list | Restart your agent |
| A skill tells the agent to read a missing file | The bundled file did not travel | Reinstall; `agentic validate` catches this before release |

`agentic validate skills/` and `agentic build --check` both exit non zero and name what is wrong, so either works as a CI or pre commit gate.

**What this will not do**

- **Declare your work done.** `done` is yours. A skipped step is recorded as skipped rather than held against you.
- **Block you on an unratified decision.** An `Assumed` spec is a standing reminder, never a gate.
- **Catch everything with a prompt.** The spec gate is layered, with `/check verify` and `/test` behind it, not absolute on its own.
- **Edit on review.** A review reports; what changes is your call.
- **Let one skill rewrite another's files.** `/sync` adds lines and rewrites single lines it owns, never prose a person wrote.
- **Prove quality.** The standard proves a declaration is consistent and its rules were injected. It cannot prove the skill gives good advice; that still needs a person reading the output.

**Do I have to run all nine?** No. A tiny change is `/develop` then `/check verify`. A bug is `/debug`.

**What if there is no spec yet?** `/develop` stops and routes you to `/architect`. You can override, and the assumption is recorded as an `Assumed` spec rather than lost.

**Why clear the session between stages?** A long chat costs more and drifts. The work is in files, so a fresh session reads current state from disk and loses nothing.

**What if my agent cannot spawn a reviewer?** `/check review` runs inline and says plainly that the review was not independent. That sentence is the finding.

---

## 🛠️ Development

```bash
npm test          # node:test, no dependencies
npm run validate  # the standard, against this repo's own skills
npm run build     # regenerate the injected blocks in skills/, in place
npm run check     # all three, and what CI runs
npm run tokens    # where the tokens went in your last session
```

The standard's own injected prose is held to the rules it enforces on authors, by a test over every family at every level: an author breaking a rule affects one skill, the standard breaking it affects every skill it ships.

Architecture, and why installing is rented rather than rebuilt: [`docs/architecture.md`](docs/architecture.md).

---

## 📄 License

MIT
