# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two things in one repo:

- `src/` is **agentic**, a zero dependency package manager for Agent Skills. It
  resolves a skill from git or a path, validates it against a standard,
  compiles the standard's rules into it, and installs it for one or more agent
  tools.
- `skills/` holds the nine workflow skills authored against that standard.

The distinguishing behavior: the installer **refuses** a skill whose standard
declaration is incoherent, and validation runs before anything is written.

## Commands

```bash
npm test          # node --test, using its own file discovery
npm run validate  # the standard against skills/
npm run check     # both, and what CI runs
node src/cli.mjs <command>   # run the CLI from source
```

Run a single test file: `node --test test/compile.test.mjs`

## Architecture

A staged pipeline where only three stages touch the world:

```
source -> fetch[I/O] -> skill -> validate -> compile -> targets -> install[I/O] -> lock[I/O]
```

Everything between `fetch` and `install` is pure functions over strings. Keep it
that way: the entire standard is testable with string literals and no fixtures,
which is the property that makes this codebase pleasant to change.

`install.mjs` holds the seam. `prepareInstall` plans and writes nothing;
`commitInstall` writes. A skill that fails validation returns no planned files,
so it can never land half installed, and `--dry-run` is the same path minus the
last call.

## Rules specific to this repo

- **Zero dependencies, permanently.** No argument parser, no colour library, no
  YAML parser, no test framework. A tool that installs without a dependency tree
  must not have one.
- **A rule family owns its prose and its checks in one file** under
  `src/standard/`. Never split the injected text from the validator that
  enforces it.
- **Targets stay thin.** They differ only in path and frontmatter dialect.
  Anything computed in a target belongs upstream.
- **Never write a shared discipline block into a skill body.** Declare it in
  frontmatter; the compiler injects it. Hand written duplicates are the exact
  problem this project exists to remove.
- **Bump `STANDARD_VERSION`** in `src/standard/index.mjs` when injected prose or
  invariants change, then update every skill's declaration.

## Authoring skills

Skills declare all five standard families explicitly. There are no defaults, and
`off` must be typed. Full conventions in `docs/authoring.md`; the normative rule
reference is `docs/standard.md`.

The validator enforces prose rules the skills themselves teach: no em or en
dashes, no hardcoded vendor model aliases, no naming a specific subagent tool in
prose, no shell glue that breaks on PowerShell, and byte budgets.

## Notes

- VS Code's agent file linter flags `allowed-tools` and `standard` as unknown
  frontmatter keys. Expected: `standard` is compile time only and stripped on
  install.
- There is no biome config here. Biome diagnostics in the editor come from a
  global setting, not from this project.
