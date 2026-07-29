<div align="center">

# ⚙️ agentic

### The package manager for Agent Skills that **compiles and refuses**

*Every skill declares the engineering discipline it commits to. The installer writes that discipline into the file. A skill whose declaration is incoherent never installs at all.*

[![check](https://github.com/Ericokim/agentic_skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Ericokim/agentic_skills/actions/workflows/ci.yml)
[![node](https://img.shields.io/badge/node-%E2%89%A520-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[![Claude Code](https://img.shields.io/badge/Claude_Code-✓-D97757)](https://claude.com/claude-code)
[![Codex](https://img.shields.io/badge/Codex-✓-412991)](https://openai.com)
[![Cursor](https://img.shields.io/badge/Cursor-partial-6E7681)](https://cursor.com)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_format-1f6feb)](https://agentskills.io)

**[Quick start](#-quick-start) · [How it works](#-what-makes-it-different) · [The standard](#-the-standard) · [Skills](#-the-nine-workflow-skills) · [CLI](#-commands) · [Docs](#-contents)**

</div>

---

## ⚡ Quick start

Needs Node 20+, git, and one agent tool (Claude Code, Codex, or Cursor):

```bash
node --version && git --version
```

Run this in a **real project**, not an empty folder. These skills read your code.

```bash
cd your-project

npx -y github:Ericokim/agentic_skills#v0.1.0 init
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/audit#v0.1.0
```

```text
✓ wrote skills.json
  targets: claude-code (detected)
✓ audit github:Ericokim/agentic_skills/skills/audit#v0.1.0 · 1 file
```

Then run `/audit` in your agent. It reads your manifests and CI config, **runs your build and test commands rather than assuming they work**, and writes `AGENTS.md` with what is actually true. Anything it could not verify is recorded as unknown rather than guessed.

`init` detects your agent tools from `.claude/`, `.agents/`, and `.cursor/`. Override with `-t claude-code,codex` if it guesses wrong.

**Run it from GitHub, not npm.** `agentic` and `agentic-skills` are taken on npm by unrelated packages, so `npx agentic` would run somebody else's code. Installed globally or as a dev dependency the command is just `agentic`, which is how it is written from here on.

**Pin the tag.** `#v0.1.0` fixes both the tool and the skills to one release. Drop it and every run fetches whatever is on `main` that day, so two people on the same team can get different tools and different skills. `-y` skips npx's install prompt, which otherwise blocks any script or CI job.

| | Use |
|---|---|
| Trying it out | `npx -y github:Ericokim/agentic_skills init` |
| Team or CI | `npx -y github:Ericokim/agentic_skills#v0.1.0 init` |
| Daily driver | `npm i -D github:Ericokim/agentic_skills#v0.1.0`, then `agentic` |

---

## 📖 Contents

| | Section | What you get |
|:--:|---|---|
| 🎯 | [What makes it different](#-what-makes-it-different) | The two problems this solves, with output |
| 📐 | [The standard](#-the-standard) | Five rule families and the invariants between them |
| 🧩 | [The nine workflow skills](#-the-nine-workflow-skills) | Usage and a use case for each |
| ⌨️ | [Commands](#-commands) | Full CLI reference, options, exit codes |
| 🔗 | [Sources](#-sources) · [Targets](#-targets) | Where skills come from, where they go |
| 🔒 | [Manifest and lockfile](#-manifest-and-lockfile) | `skills.json`, `skills.lock`, drift detection |
| 🚀 | [Adding it to an existing project](#-adding-it-to-an-existing-project) | Adoption, collisions, what gets written |
| 👥 | [Working as a team](#-working-as-a-team) | Reproducible installs, what to commit |
| 💰 | [Token cost](#-token-cost) | Budgets, and measuring a real session |
| 🌍 | [Portability](#-portability) | Rules that keep skills working everywhere |
| 🩹 | [Troubleshooting](#-troubleshooting) | Every error message, and its fix |
| 🚧 | [What this will not do](#-what-this-will-not-do) · [FAQ](#-faq) | The limits, stated plainly |
| ✍️ | [Authoring a skill](#-authoring-a-skill) | Writing one that passes |
| 🛠️ | [Development](#-development) | Tests, checks, architecture |

**Deep dives:** [`docs/standard.md`](docs/standard.md) · [`docs/authoring.md`](docs/authoring.md) · [`docs/architecture.md`](docs/architecture.md)

---

## 🎯 What makes it different

A skill is a prompt that ships, and it loads into context on every run. That creates two problems.

### ❶ The duplication problem

Shared rules (how to cite evidence, what counts as done) must appear in every skill, because each installed skill stands alone. The usual answer is pasting the block everywhere and linting that the copies stayed identical, which is a build step performed by a linter. Here you declare, and the compiler writes:

```yaml
# what you author                        # what gets installed
standard:                                ## Evidence classification    <- injected
  evidence: strict          ────────>    ## Anti-hallucination rules   <- injected
  tdd: red-green                         ## Test driven development    <- injected
  review: independent                    ## Independent review         <- injected
  done: checklist                        ## <your skill content>
                                         ## Definition of done         <- injected
```

### ❷ The incoherence problem

A skill can promise a definition of done with no way to cite evidence, or independent review with no way to spawn a reviewer. Both look fine line by line. The installer checks the combination:

```bash
agentic add ./skills/liar
```

```text
✗ liar does not meet the standard, so it was not installed
    error standard-invariant  done requires evidence at tagged or stricter, because
                              the checklist asks for [O] evidence that an untagged
                              skill has no way to express
    error standard-invariant  review: independent requires a subagent capability, so
                              add Agent to allowed-tools (a skill cannot promise an
                              independent reviewer it has no way to spawn)
```

Validation runs before anything is written, so a failing skill never lands half installed.

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

Normative detail: [`docs/standard.md`](docs/standard.md).

---

## 🧩 The nine workflow skills

One skill per phase. Run only the ones a change needs, in any order.

```
idea → /scope → /audit → /architect → /develop → /check verify → /test → /check review → /document → /sync
```

State lives in files (a scope, specs, AGENTS.md, tests), not in a chat session, so work survives across sessions and people.

| | Skill | Phase | What it does | Owns |
|:--:|---|---|---|---|
| 🗺️ | [`scope`](#scope) | Plan | Turns an idea into a coarse, ordered plan and keeps it true as work ships | `docs/scope/` |
| 🔎 | [`audit`](#audit) | Context | Writes the AGENTS.md context files every other skill reads | `AGENTS.md` |
| 📐 | [`architect`](#architect) | Design | Makes one load bearing decision and writes it as a spec | `docs/specs/` |
| 🔨 | [`develop`](#develop) | Build | Builds a feature from its spec, then advances the scope | your source |
| ✅ | [`check`](#check) | Verify | Confirms a change before merge, in two modes | `docs/reviews/` |
| 🧪 | [`test`](#test) | Verify | Writes a test suite for what you just changed | your tests |
| 📝 | [`document`](#document) | Ship | Writes the human facing prose from the real diff | PR, changelog |
| 🔄 | [`sync`](#sync) | Ship | Reconciles AGENTS.md, the scope, and spec statuses | statuses |
| 🐛 | [`debug`](#debug) | Any time | Finds the root cause and makes the minimal fix | the fix |

One writer per artifact, which is what keeps two skills from fighting over the same file.

### Where to start

| Situation | Start with | Why |
|---|---|---|
| **Existing codebase** | `/audit` → `/scope` → the loop | Every skill reads AGENTS.md, and `/scope` would otherwise plan against a project it has not read |
| **New product** | `/scope` → `/architect` → scaffold → `/audit` → the loop | The stack is decided and the project exists before `/audit` runs, so it reads something real rather than describing intentions as facts |
| **One small change** | Only what it needs | A typo is `/develop`. A bug is `/debug`. A change nobody will review needs no `/document` |
| **Monorepo** | `/audit <workspace>` per package | Each workspace gets its own AGENTS.md with its own commands. One root file describing five packages describes none of them |

**The feature loop**, once the context exists:

```
/architect → /develop → /check verify → /test → /check review → /document → /sync
```

`/scope` sets a depth for the project that you can override per feature. It is a suggested checking tail after `/develop`, never a track you are locked onto:

| Depth | Suggested after `/develop` |
|---|---|
| `Prototype` | nothing, self checked, for throwaway work |
| `Alpha` | `/check verify` |
| `Beta` | adds `/test` |
| `GA` | adds `/check review` and `/document` |

### The thread that ties the stages together

`/architect` writes acceptance criteria into the spec. `/develop` builds to them. `/check verify` proves each one against the running app. `/test` turns them into the first tests. `/document` describes what they delivered.

That thread is why the spec matters more than any other artifact. Without it, each stage invents its own idea of what "working" means, and they quietly disagree.

### The spec gate

`/develop` asks one question before writing code: **would building this mean inventing a load bearing decision that no spec records?** If yes, it stops and routes to `/architect`.

Load bearing means changing it later means changing code in many places: a stack, a data model, a provider, an auth boundary. Cheap to reverse needs no spec.

You can override. The override is honored and it is not free: the assumption is written as an `Assumed` spec and flagged, so a decision made under time pressure lands in the repo rather than a chat log nobody rereads. The flag never blocks you declaring the feature done.

The gate is layered, not magic. `/architect` names the source of every value a feature must produce, so gaps surface at design time, and `/develop` checks that coverage again before building. Together those catch most of it. Behavioural correctness is caught behind them by `/check verify` and `/test`.

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
```

> **Use case.** You ask for a checkout flow but never decided which payment provider. `/develop` stops at the spec gate and routes you to `/architect` instead of quietly picking Stripe. You can override, and the assumption gets recorded as an `Assumed` spec rather than lost.

#### check

```bash
/check verify         # drive the real app against the spec
/check review         # a fresh reader on the diff
/check                # asks which, never guesses
```

> **Use case.** Your tests are green but you have not seen the feature work. `/check verify` starts the app and drives every acceptance criterion through the real interface. Green tests prove assertions hold; they do not prove a specced page was ever built.

#### test

```bash
/test                 # targets uncommitted changes
/test src/search      # or a path
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
/sync                 # the last step, around merge
```

> **Use case.** Your change moved a directory and added a dependency, so AGENTS.md is now subtly wrong for everyone. `/sync` adds the lines that are missing and rewrites only single lines it owns. It never touches prose a person wrote.

#### debug

```bash
/debug the search endpoint returns 500 on empty query
```

> **Use case.** A test fails for a reason nobody understands. `/debug` runs a reproduce, localize, hypothesize, test, fix, verify loop, one hypothesis at a time, then pins the fix with a regression test checked in both directions.

</details>

---

## ⌨️ Commands

| | Command | Does | Writes |
|:--:|---|---|:--:|
| 🆕 | `agentic init` | Create `skills.json`, detecting the agent tools in use | ✍️ |
| ⬇️ | `agentic add [source]` | Install a skill, or every skill in `skills.json` | ✍️ |
| 🔄 | `agentic update [name]` | Re-resolve and recompile, showing what changed | ✍️ |
| 🗑️ | `agentic remove <name>` | Delete a skill and the files it owns | ✍️ |
| 📋 | `agentic list` | Installed skills, drift, and anything that is wrong | 👁️ |
| ✅ | `agentic validate [path]` | Check skill sources against the standard | 👁️ |
| 💰 | `agentic tokens [file]` | Where the tokens went in a real session | 👁️ |

<sub>✍️ writes files · 👁️ read only</sub>

| Option | Applies to | Does |
|---|---|---|
| `-t, --target <id>` | `init` `add` `update` | Override targets (repeatable, or comma separated) |
| `-n, --name <name>` | `add` | Name to install a source under |
| `--root <dir>` | all | Project root (default: working directory) |
| `--cache <dir>` | `add` `update` | Source cache (default: `~/.cache/agentic/sources`) |
| `--dry-run` | `add` `update` | Plan the work and write nothing |
| `--force` | `add` `update` | Overwrite installed files that were edited by hand |
| `--top <n>` | `tokens` | Heaviest turns to show (default 12) |
| `--project <dir>` | `tokens` | Encoded transcript directory to read |

**Exit codes:** `0` success · `1` something is wrong · `2` bad usage

`list` and `validate` exit non zero when something is wrong, so either works as a CI or pre commit check. `validate` is the one to gate on: it runs the same code path `add` does, so a green validate means installable.

### 🔗 Sources

```bash
agentic add github:owner/repo#v1.0.0          # a tag, branch, or commit
agentic add github:owner/repo/skills/build    # a skill inside a repo
agentic add git+https://host/team/skills.git  # any git remote
agentic add ./local/skill                     # a directory on this machine
```

No registry service. A source is a git repo or a path, a version is a git ref, and publishing is pushing.

### 🎛️ Targets

| Target | Writes to | Detected from | Bundled files |
|---|---|---|---|
| `claude-code` | `.claude/skills/<name>/` | `.claude/` | yes |
| `generic` | `.agents/skills/<name>/` | `.agents/` | yes |
| `codex` | `.agents/skills/<name>/` plus an `agents/openai.yaml` picker adapter | opt in | yes |
| `cursor` | `.cursor/rules/<name>.mdc` | `.cursor/` | **no** |

`init` detects at most one target per directory: `codex` writes the same `.agents` layout as `generic`, so detecting both would plan the same file twice. Add the Codex picker adapter with `-t codex` when you want it.

**Bundled files travel with the skill.** A skill can ship mode files and templates beside its `SKILL.md` and reference them by relative path, and those files install with it. Cursor is the exception, being one flat file with nowhere to put a sibling, and it says so rather than leaving an agent to find a file missing mid task:

```bash
agentic add ./skills/check -t cursor
```

```text
✓ check · 1 file
    ! cursor cannot carry bundled files, so 2 were left out and this skill will be incomplete there
```

### 🔒 Manifest and lockfile

```jsonc
// skills.json   the intent, hand editable
{
  "standard": "1.0.0",
  "targets": ["claude-code", "codex"],
  "skills": { "develop": "github:Ericokim/agentic_skills#v1.0.0" }
}

// skills.lock   the machine truth
{ "develop": { "resolved": "...", "sha": "a1b2c3...", "standard": "1.0.0",
               "files": { ".claude/skills/develop/SKILL.md": "sha256-..." } } }
```

The lockfile hashes the **emitted** file, not the source. That is what lets `agentic list` tell that someone hand edited an installed skill, so an update warns instead of silently overwriting work a person did on purpose:

```bash
agentic add ./skills/develop
```

```text
! develop has local edits, so it was left alone:
    .claude/skills/develop/SKILL.md
    reinstall over them with --force
```

---

## 🚀 Adding it to an existing project

| | |
|---|---|
| **It adds, never modifies** | Installing writes `skills.json`, `skills.lock`, and the skill directories. Nothing already in the repo is edited or deleted, including skills you already had |
| **Names have to be free** | A skill installs under its own name, so an existing skill called `check` would collide. `list` shows what is installed and from where |
| **`/audit` comes first** | It writes the AGENTS.md every other skill reads. `/scope` first would plan against a project it has not read |

### 🔍 Checking your own installed skills

`validate` over an installed directory does the sensible thing. Installed skills are compiled output, so they are held to the rules that still apply once compiled (parse, name, budget, prose) and are not asked for a standard declaration the compiler deliberately stripped:

```bash
agentic validate .claude/skills
```

```text
✓ 9 skills and 17 bundled files checked against standard 1.0.0, all pass
  9 of these are installed skills, checked against the rules that still apply once compiled
  to check declarations and invariants, validate the source they came from
```

---

## 👥 Working as a team

Commit `skills.json` and `skills.lock`. Let the installed directories be ignored, the way you would treat `node_modules`:

```gitignore
.claude/
.agents/
```

A teammate then runs one command and gets exactly what you have, at the pinned commit:

```bash
agentic add        # no argument: install everything in skills.json
```

The lockfile records the resolved commit and the standard version per skill, so this is reproducible rather than "whatever is on main today".

**The injected blocks come from the version of the tool you run**, not from the skill source. Two people on the same skill commit get different installed text if they run different versions of `agentic`. That is why the standard version is recorded per skill in the lockfile, and why `list` flags a skill compiled against an older standard:

```
develop  compiled against standard 1.0.0, current is 1.1.0
  fix: agentic update develop
```

---

## 💰 Token cost

**The compiled size is the real number.** `validate` measures what gets installed, not what you edit, because the standard's blocks are injected and the installed file is roughly twice the source:

```bash
agentic validate skills/
```

```text
✓ 9 skills and 8 bundled files checked against standard 1.0.0, all pass
  context cost once installed: 54.4 KB across all, 6.0 KB average, largest is debug at 6.5 KB
  only the skills an agent actually loads cost anything, one at a time
```

About 1.5k tokens for the skill in use. The 54 KB total is never all loaded at once: an agent reads the one skill it is running.

**Budgets warn before they fail.** A source over 80% of the 12 KB budget gets a warning while it is still passing, so growth is visible early. When a skill breaches, shorten the skill. Raising the ceiling to fit the file is how a budget stops meaning anything.

For a real session rather than an estimate, `agentic tokens` reads the transcript and separates main thread from subagent cost, splitting raw tokens into fresh input, cache write, and cache read:

```bash
agentic tokens
```

```text
  WHERE      TURNS     INPUT CACHE WRITE CACHE READ   OUTPUT  BILLED EQ
  main         147       290      469.5k   23874.3k   170.0k    3824.4k
  subagents      0         0           0          0        0          0

  24514.0k raw tokens, 3824.4k billed equivalent units.
  97% of raw tokens were cache reads, billed at a tenth of fresh input.
  22% of the real cost was output, which is what to cut first.
```

---

## 🌍 Portability

Portability is enforced, not hoped for: `validate` rejects a skill that would behave differently across tools.

| Rule | Stops |
|---|---|
| `no-model-alias` | Hardcoding a vendor model name. Describe the tier in role words instead |
| `capability-first` | Naming one vendor's subagent tool in prose. Describe the capability |
| `portable-shell` | Shell glue that breaks on PowerShell, so skills run on Windows too |
| `no-long-dash` | Em and en dashes, which render inconsistently across clients |

`git` is the only external command, and it behaves the same on macOS, Linux, and Windows. Where a skill needs a capability the host lacks (spawning a reviewer, driving a browser), it says so in its report rather than pretending the step ran.

`.claude/agents/` ships two read only helpers used by the workflow: `scout` for compact repo maps on a cheap model, and `reviewer` for the independent review the standard requires. Other clients ignore that directory.

---

## ✍️ Authoring a skill

```bash
agentic validate skills/     # the same code path add runs
```

A green `validate` means installable. Conventions, budgets, and the full rule list: [`docs/authoring.md`](docs/authoring.md).

---

## 🩹 Troubleshooting

| What you see | What it means | Do this |
|---|---|---|
| `no skills.json here` | `init` has not run in this directory | `cd` to the project, run `init` |
| `has local edits, so it was left alone` | You edited an installed skill by hand | Keep it, or overwrite with `--force` |
| `does not meet the standard` | The skill's rules contradict each other | Fix the source; the message names the rule |
| `could not find a skill named X` | Wrong name or wrong repo | The message lists what the source does provide |
| `repository not found` | Bad URL, or a private repo | Check the URL and your git access |
| npx asks `Ok to proceed?` | You left out `-y` | Type `y`, or add `-y` |
| Agent does not see the skill | Some tools cache the skill list | Restart your agent |

`agentic list` checks everything at once, exits non zero, and names a fix for anything wrong.

---

## 🚧 What this will not do

The limits matter as much as the features, and stating them is cheaper than letting someone discover them.

- **It will not declare your work done.** `done` is yours. The depth only suggests where to stop, and a skipped step is recorded as skipped rather than held against you.
- **It will not block you on an unratified decision.** An `Assumed` spec is a standing reminder, never a gate.
- **The spec gate is strong, not absolute.** No prompt catches everything, which is why `/check verify` and `/test` sit behind it.
- **A review reports, it does not edit.** What changes is your call.
- **No skill rewrites another skill's files.** `/sync` adds lines and rewrites single lines it owns, never prose a person wrote. Where the repo contradicts curated text, it reports rather than resolves.
- **The standard checks coherence, not quality.** It can prove a declaration is consistent and its rules were injected. It cannot prove the skill gives good advice. That still needs a person reading the output.

---

## ❓ FAQ

**Do I have to run all nine?** No. A tiny change is `/develop` then `/check verify`. A bug is `/debug`.

**What if there is no spec yet?** `/develop` stops and routes you to `/architect`. You can override, and the assumption is recorded rather than lost.

**Is it fine to never ratify an `Assumed` spec?** Allowed, and not free. It stays visible in `docs/specs/` and resurfaces on a bare `/scope` or `/sync`. For a spike, leave it.

**Why clear the session between stages?** A long chat costs more and drifts. The work is in files, so a fresh session reads current state from disk and loses nothing.

**Where do files go if `docs/` is a published site?** They move to `.workflow/`, so internal planning does not ship to users.

**What if my agent cannot spawn a reviewer?** `/check review` runs inline and says plainly that the review was not independent. That sentence is the finding.

**Does updating the tool change my installed skills?** Yes, and that is the intended path. Injected blocks come from the version of `agentic` you run, so `agentic update` recompiles against the current standard.

---

## 🛠️ Development

```bash
npm test          # node:test, no dependencies
npm run validate  # the standard, against this repo's own skills
npm run check     # both, and what CI runs
npm run tokens    # where the tokens went in your last session
```

The standard's own injected prose is held to the rules it enforces on authors, by a test over every family at every level. Getting that wrong is worse than an author getting it wrong: an author breaks a rule in one skill, the standard breaks it in every skill it ships.

Architecture and why the pipeline is shaped this way: [`docs/architecture.md`](docs/architecture.md).

---

## 📄 License

MIT
