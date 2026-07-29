# agentic

A package manager for Agent Skills, and a workflow built on it.

Most skill installers move files. This one **compiles and refuses**. Every skill
declares which engineering discipline it commits to, the installer injects that
discipline into the installed file, and a skill whose declaration is incoherent
never installs at all.

```bash
npx agentic init
npx agentic add github:erickim/agentic_skills/skills/develop
```

Works with Claude Code, Codex, Cursor, and any client that reads the open
`.agents/skills` layout. Zero dependencies, so `npx` costs nothing to try.

**Contents:** [Why](#why-this-exists) · [The standard](#the-standard) ·
[The nine skills](#the-workflow-skills) · [Commands](#commands) ·
[Token cost](#token-cost) · [Which agents work](#which-agents-this-works-with) ·
[Authoring](#authoring-a-skill)

---

## Why this exists

A skill is a prompt that ships. It tells an agent how to work, and it loads into
context on every run. That makes two problems worth solving.

**The duplication problem.** Shared rules (how to cite evidence, what counts as
done) have to appear in every skill, because each installed skill must stand
alone. The usual answer is to paste the block into all of them and write a
linter that checks the copies stayed identical. That is a build step being
performed by a linter. Here you declare what you need and the compiler writes
it:

```yaml
# what you author                        # what gets installed
standard:                                ## Evidence classification    <- injected
  evidence: strict          ────────>    ## Anti-hallucination rules   <- injected
  tdd: red-green                         ## Test driven development    <- injected
  review: independent                    ## Independent review         <- injected
  done: checklist                        ## <your skill content>
                                         ## Definition of done         <- injected
```

**The incoherence problem.** A skill can promise a definition of done while
having no way to cite evidence, or promise independent review with no ability to
spawn a reviewer. Both look fine line by line. The installer checks the
combination and rejects it:

```
✗ liar does not meet the standard, so it was not installed
    error standard-invariant  done requires evidence at tagged or stricter, because
                              the checklist asks for [O] evidence that an untagged
                              skill has no way to express
    error standard-invariant  review: independent requires a subagent capability, so
                              add Agent to allowed-tools (a skill cannot promise an
                              independent reviewer it has no way to spawn)
```

Validation runs before anything is written, so a failing skill never lands half
installed.

---

## The standard

Five rule families. Each skill declares a level for all five, explicitly. There
are no defaults, because a skill that has not said where it stands on evidence
has not decided.

| Family | Levels | What it injects |
|---|---|---|
| `evidence` | `off` `tagged` `strict` | The `[O]` Observed, `[D]` Derived, `[A]` Assumed taxonomy, and what each requires as backing |
| `anti-hallucination` | `off` `strict` | Never assert a file or API exists without reading it, never report a command you did not run, cite `file:line`, "I do not know" is a valid answer |
| `tdd` | `off` `red-green` `red-green-refactor` | The loop, plus: a test you have not watched fail proves nothing |
| `review` | `off` `self` `independent` | Fresh context or different model than the author, reviewer reports and never edits |
| `done` | `off` `checklist` | Every criterion has `[O]` evidence, no `[A]` in a completion claim, skipped work named as skipped |

**Invariants** are what a per-file linter cannot catch. Each rejects a
declaration that is valid line by line but incoherent as a whole:

- `done` needs `evidence` at `tagged` or better. A definition of done that
  cannot cite evidence is decoration.
- `tdd` needs `evidence: strict`. The red step is only real if the failing run
  is shown.
- `review: independent` needs a subagent capability in `allowed-tools`.

Full normative detail: [`docs/standard.md`](docs/standard.md).

---

## The workflow skills

Nine skills, one per phase. Run only the ones a change needs, in any order.

```
idea → /scope → /audit → /architect → /develop → /check verify → /test → /check review → /document → /sync
```

Run `/debug` any time something breaks. Run a bare `/scope` any time to see
where things stand. State lives in files (a scope, specs, AGENTS.md, tests), not
in a chat session, so work survives across sessions and across people.

### scope

Turns an idea into a coarse, ordered plan and keeps it true as work ships.

```bash
/scope a tool that turns podcast episodes into searchable transcripts
/scope                # bare: reconcile status from the repo, queue what is next
```

> **Use case.** You shipped two features last week and cannot remember what is
> next. A bare `/scope` reads the repo, marks what actually landed, and tells
> you the next slice. It sets status from code, so a feature marked
> `in-progress` with nothing written gets moved back to `queued`.

### audit

Writes the AGENTS.md context files every other skill reads.

```bash
/audit                # whole repo
/audit src/auth       # one area, gets its own nested AGENTS.md
```

> **Use case.** You have inherited a codebase and the agent keeps guessing the
> test command wrong. `/audit` reads the manifests and CI config, runs the build
> and test commands to check they work, and writes down what is actually true.
> Anything it could not verify is recorded as unknown rather than guessed.

### architect

Makes one load bearing decision and writes it as a spec whose acceptance
criteria become the contract.

```bash
/architect how should sessions be stored
```

> **Use case.** You are about to build auth and have not decided between JWTs
> and server sessions. `/architect` asks one question at a time, recommends an
> answer with its reason, and writes `docs/specs/`. The decision survives the
> chat that produced it.

### develop

Builds a feature from its spec, then advances the scope.

```bash
/develop the transcript search page
```

> **Use case.** You ask for a checkout flow but never decided which payment
> provider. `/develop` stops at the spec gate and routes you to `/architect`
> instead of quietly picking Stripe. You can override, and the assumption gets
> recorded as an `Assumed` spec rather than lost.

### check

Confirms a change before merge, in two modes.

```bash
/check verify         # drive the real app against the spec
/check review         # a fresh reader on the diff
/check                # asks which, never guesses
```

> **Use case.** Your tests are green but you have not seen the feature work.
> `/check verify` starts the app and drives every acceptance criterion through
> the real interface. Green tests prove assertions hold; they do not prove a
> specced page was ever built.

### test

Writes a test suite for what you just changed.

```bash
/test                 # targets uncommitted changes
/test src/search      # or a path
```

> **Use case.** You just fixed a parser and want tests that would actually catch
> the regression. `/test` picks a strategy per file (happy path, boundaries,
> error states, accessibility) and runs the full suite, not only the new tests.

### document

Writes the human facing prose from the real diff.

```bash
/document pr
/document changelog | release-note | postmortem
```

> **Use case.** You need a PR body and the branch has 14 commits with unhelpful
> messages. `/document pr` reads the diff rather than the commit log, and says
> what changed, how it was verified, and what was deliberately left out.

### sync

Reconciles AGENTS.md, the scope, and spec statuses after a change.

```bash
/sync                 # the last step, around merge
```

> **Use case.** Your change moved a directory and added a dependency, so
> AGENTS.md is now subtly wrong for everyone. `/sync` adds the lines that are
> missing and rewrites only single lines it owns. It never touches prose a
> person wrote.

### debug

Finds the root cause and makes the minimal fix.

```bash
/debug the search endpoint returns 500 on empty query
```

> **Use case.** A test fails for a reason nobody understands. `/debug` runs a
> reproduce, localize, hypothesize, test, fix, verify loop, one hypothesis at a
> time, then pins the fix with a regression test that is checked in both
> directions.

Full walkthrough, including who owns which file and one idea followed from scope
to shipped: [`docs/workflow-guide.md`](docs/workflow-guide.md).

---

## Commands

```
agentic init                create skills.json, detecting the agent tools in use
agentic add [source]        install a skill, or every skill in skills.json
agentic update [name]       re-resolve and recompile, showing what changed
agentic remove <name>       delete a skill and the files it owns
agentic list                installed skills, drift, and anything that is wrong
agentic validate [path]     check skill sources against the standard
agentic tokens [file]       where the tokens went in a real session
```

Options: `-t, --target`, `-n, --name`, `--root`, `--cache`, `--dry-run`,
`--force`.

### Sources

```bash
agentic add github:owner/repo#v1.0.0          # a tag, branch, or commit
agentic add github:owner/repo/skills/build    # a skill inside a repo
agentic add git+https://host/team/skills.git  # any git remote
agentic add ./local/skill                     # a directory on this machine
```

No registry service. A source is a git repo or a path, a version is a git ref,
and publishing is pushing.

### Targets

| Target | Writes to |
|---|---|
| `claude-code` | `.claude/skills/<name>/SKILL.md` |
| `codex` | `.agents/skills/<name>/` plus an `agents/openai.yaml` interface adapter |
| `generic` | `.agents/skills/<name>/SKILL.md` |
| `cursor` | `.cursor/rules/<name>.mdc` (lossy: one flat file, no bundled assets) |

`init` detects which of these a project already uses.

---

## The two files

```jsonc
// skills.json   the intent, hand editable
{
  "standard": "1.0.0",
  "targets": ["claude-code", "codex"],
  "skills": { "develop": "github:erickim/agentic_skills#v1.0.0" }
}

// skills.lock   the machine truth
{ "develop": { "resolved": "...", "sha": "a1b2c3...", "standard": "1.0.0",
               "files": { ".claude/skills/develop/SKILL.md": "sha256-..." } } }
```

The lockfile hashes the **emitted** file, not the source. That is what lets
`agentic list` tell that someone hand edited an installed skill, so an update
warns instead of silently overwriting work a person did on purpose:

```
! develop has local edits, so it was left alone:
    .claude/skills/develop/SKILL.md
    reinstall over them with --force
```

---

## Token cost

A skill loads into context every time it runs, so its size is a bill paid on
every invocation rather than once at install. Two things keep that honest.

**The compiled size is the real number.** `validate` measures what gets
installed, not what you edit, because the standard's blocks are injected and the
installed file is roughly twice the source:

```
✓ 9 skills checked against standard 1.0.0, all pass
  context cost once installed: 54.4 KB across all, 6.0 KB average, largest is debug at 6.5 KB
  only the skills an agent actually loads cost anything, one at a time
```

About 1.5k tokens for the skill in use. The 54 KB total is never all loaded at
once: an agent reads the one skill it is running.

**Budgets warn before they fail.** A source over 80% of the 12 KB budget gets a
warning while it is still passing, so growth is visible early. When a skill
breaches, shorten the skill. Raising the ceiling to fit the file is how a budget
stops meaning anything.

Three habits in the authoring rules exist for the same reason: a line that does
not change what the agent does is deleted, rare and long content moves to a
bundled file the skill reads only when needed, and a rule is stated once.

## Which agents this works with

Anything that reads the Agent Skills format. Portability is enforced, not hoped
for: `validate` rejects a skill that would behave differently across tools.

| Rule | Stops |
|---|---|
| `no-model-alias` | Hardcoding a vendor model name. Describe the tier in role words instead. |
| `capability-first` | Naming one vendor's subagent tool in prose. Describe the capability. |
| `portable-shell` | Shell glue that breaks on PowerShell, so skills run on Windows too. |
| `no-long-dash` | Em and en dashes, which render inconsistently across clients. |

`git` is the only external command, and it behaves the same on macOS, Linux, and
Windows. Where a skill needs a capability the host lacks (spawning a reviewer,
driving a browser), it says so in its report rather than pretending the step ran.

`.claude/agents/` ships two read only helpers used by the workflow: `scout` for
compact repo maps on a cheap model, and `reviewer` for the independent review
the standard requires. Other clients ignore that directory.

## Authoring a skill

```bash
agentic validate skills/           # the same code path add runs
```

A green `validate` means installable. Conventions, budgets, and the full rule
list: [`docs/authoring.md`](docs/authoring.md).

## Contributing

```bash
npm test          # node:test, no dependencies
npm run validate  # the standard, against this repo's own skills
npm run check     # both
```

Architecture and why the pipeline is shaped this way:
[`docs/architecture.md`](docs/architecture.md).

## License

MIT
