# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A skills repository with a standard, and the tools that hold it to that standard.

- `skills/` holds the nine workflow skills. One directory, no second compiled
  copy: a person authors the prose and the `standard:` declaration, and
  `agentic build` regenerates the blocks between the
  `<!-- agentic:standard -->` markers in place. It is also what an installer
  reads. Edit the prose and the declaration freely; never edit inside a marker
  region, because a build overwrites it.
- `src/` is **agentic**, a zero dependency tool that compiles the standard into
  those skills (`build`), refuses an incoherent one (`validate`), and generates
  a project's `AGENTS.md` from repository evidence (`context`).

**Installing is not in this repo.** The skills CLI does it:

```bash
npx -y skills@latest add Ericokim/agentic_skills
```

That is deliberate. The skills CLI already resolves a git source, runs the
selection wizard, knows the paths of seventy five agent tools, and writes
`skills-lock.json`. It also cannot be imported (it publishes a `bin` and no
`main`), so wrapping it would mean shelling out to a CLI a person can type.

The distinguishing behavior survives the split: a copier delivers the standard
only if what it copies already carries it, so `build` injects the rule blocks and
refuses to write when a declaration is incoherent. The check moved from install
time to publish time; it did not disappear.

## Commands

```bash
npm test          # node --test, using its own file discovery
npm run validate  # the standard against skills/
npm run build     # regenerate the blocks in skills/ in place, refusing on a violation
npm run check     # test, validate, and build --check - what CI runs
node src/cli.mjs <command>   # run the CLI from source
```

Run `npm run build` after changing a `standard:` declaration or any injected
prose in `src/standard/`. `npm run check` (via `build --check`) fails when a
marker region no longer matches what the declaration and the standard would
produce, which is also how a hand edit inside one gets caught.

Run a single test file: `node --test test/compile.test.mjs`

## Architecture

Two pipelines, and almost all of both is pure functions over strings.

```
build:    skills/ -> skill -> validate -> compile -> skills/   (read and write at the ends only)
context:  repo -> snapshot[I/O] -> profile -> registry -> prefill -> assemble -> verify -> compare
```

Keep it that way. The entire standard is testable with string literals and no
fixtures, no temp directories, no git repo, no network, which is the property
that makes this codebase pleasant to change.

## Rules specific to this repo

- **Zero dependencies, permanently.** No argument parser, no colour library, no
  YAML parser, no test framework.
- **Do not rebuild what the skills CLI already does.** Resolving a source,
  prompting, agent paths, lockfiles, symlink or copy: all of it is rented. This
  repo owns the standard and nothing about installation.
- **A rule family owns its prose and its checks in one file** under
  `src/standard/`. Never split the injected text from the validator that
  enforces it.
- **Never write a shared discipline block into a skill body by hand.** Declare
  it in frontmatter; the compiler injects it between the markers. Hand written
  duplicates are the exact problem this project exists to remove, and `build
  --check` fails on one.
- **Bump `STANDARD_VERSION`** in `src/standard/index.mjs` when injected prose or
  invariants change, then update every skill's declaration.
- **A context section owns its text and its predicate in one file** under
  `src/context/sections/`, the same rule that applies to a standard family.
- **Generation never writes `AGENTS.md`.** It writes `AGENTS.generated.md` and
  a comparison.

## Authoring skills

Skills declare all five standard families explicitly. There are no defaults, and
`off` must be typed. Full conventions in `docs/authoring.md`; the normative rule
reference is `docs/standard.md`. Author under `skills/<name>/`, then run
`npm run build` to regenerate its marker regions before committing.

The validator enforces prose rules the skills themselves teach: no em or en
dashes, no hardcoded vendor model aliases, no naming a specific subagent tool in
prose, no shell glue that breaks on PowerShell, and byte budgets.

## Notes

- VS Code's agent file linter flags `allowed-tools` and `standard` as unknown
  frontmatter keys. Expected: `standard` is compile time only, and an installer
  that copies carries it through as an unused key.
- There is no biome config here. Biome diagnostics in the editor come from a
  global setting, not from this project.
