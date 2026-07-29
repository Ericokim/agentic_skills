# Architecture

For contributors. Why the pipeline is shaped this way, and where to add things.

## The pipeline

```
add <spec>
  │
  ├─ source.mjs    parse the spec into a descriptor          pure
  ├─ fetch.mjs     git clone into cache, resolve ref to sha  [I/O]
  ├─ skill.mjs     SKILL.md -> frontmatter, body, sections   pure
  ├─ validate.mjs  standard + packaging -> violations        pure
  ├─ compile.mjs   inject declared blocks -> markdown        pure
  ├─ targets/      plan files per target                     pure
  ├─ install.mjs   write the planned files                   [I/O]
  └─ lock.mjs      record source, sha, hash per file         [I/O]
```

Three stages touch the world. Four are pure functions over strings.

## Why the split matters

The entire standard, the whole validator, and the compiler are pure. They are
tested with string literals: no fixtures on disk, no temp directories, no git
repo, no network. For a project whose thesis is that discipline should be
checkable, the rules being the easiest thing in the codebase to test is the
point.

`install.mjs` is where the seam sits. `prepareInstall` runs everything up to and
including planning and writes nothing. `commitInstall` writes. That split is why
a skill failing validation costs nothing, and why `--dry-run` is the same code
path minus the final call rather than a parallel implementation of it.

## Module map

| Module | Owns |
|---|---|
| `cli.mjs` | Argument parsing, dispatch, exit codes |
| `commands/*.mjs` | One command each, human output, no pipeline logic |
| `source.mjs` | Spec string to descriptor |
| `fetch.mjs` | git, the source cache, ref to sha |
| `skill.mjs` | The SKILL.md parser and its frontmatter dialect |
| `standard/*.mjs` | One rule family each: its prose and its checks |
| `standard/index.mjs` | Declaration parsing, invariants, the version |
| `validate.mjs` | Packaging and portability rules, plus the standard |
| `compile.mjs` | Injection and frontmatter serialization |
| `targets/*.mjs` | Path and dialect per agent tool. No logic. |
| `manifest.mjs` `lock.mjs` | `skills.json` and `skills.lock` |
| `install.mjs` | The pipeline, assembled, plus drift detection |
| `commands/tokens.mjs` | Session transcript accounting, the only module not part of the install pipeline |
| `ui.mjs` | Terminal output |
| `context/snapshot.mjs` | One bounded read of a repository |
| `context/profile.mjs` | Snapshot to signals, each with its evidence |
| `context/sections/*.mjs` | One file per section: its text and its predicate |
| `context/registry.mjs` | The section list, and selection against a profile |
| `context/prefill.mjs` | Every value the repository already states |
| `context/assemble.mjs` | Selected sections to one flat draft |
| `context/verify.mjs` | Re-read what the model claimed to have read |
| `context/compare.mjs` | What would change, at heading level |

## Adding a rule family

1. Create `src/standard/<id>.mjs` exporting `id`, `levels`, `block(level)`, and
   `validate(skill, level)`.
2. Add it to `FAMILIES` in `src/standard/index.mjs`.
3. Add any invariant it participates in to `checkInvariants`.
4. Bump `STANDARD_VERSION`.
5. Declare the new family in every skill under `skills/`, since declaration is
   required and has no default. `npm run validate` lists what is missing.

The generic tests in `test/standard.test.mjs` iterate `FAMILIES`, so a new
family is automatically checked for a valid `off` level, a non empty block per
level, and a heading.

## Adding a target

Create `src/targets/<id>.mjs` exporting `id`, `label`, `detect`, and
`plan({root, name, compiled, skill})` returning `{path, contents}` objects. Add
it to `TARGETS`.

Targets must stay thin. They differ only in path and frontmatter dialect, which
is the smallest part of the work. Anything you are tempted to compute in a
target belongs upstream, or every target will need its own copy of it.

## Constraints

**Zero dependencies, permanently.** A tool whose job is to install with no
dependency tree should not have one. This rules out an argument parser, a colour
library, a YAML parser, and a test framework. The frontmatter dialect is small
deliberately: a skill needing more than scalars and one level of nesting is
doing too much.

**git is the only external command.** It behaves the same on macOS, Linux, and
Windows. It is invoked with an argument list and no shell, so a repository URL
containing shell metacharacters cannot become a command.

**Nothing is silently overwritten.** The lockfile hashes emitted files so a hand
edited skill is detected and reported. Every destructive path requires
`--force`.
