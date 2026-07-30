# Architecture

For contributors. Why the code is shaped this way, and where to add things.

## What is here, and what is rented

Installing is not in this repo. The skills CLI resolves a git source, runs the
selection wizard, knows the paths of seventy five agent tools, and writes
`skills-lock.json`:

```bash
npx -y skills@latest add Ericokim/agentic_skills
```

This repo owns the part that cannot be rented: the standard, compiled into every
skill before it is published, and refused when a declaration is incoherent. A
copier delivers the standard only if what it copies already carries it, which is
exactly what `build` guarantees.

An earlier version of this repo shipped its own installer: a git fetcher, a
lockfile, eleven target adapters, and a hand rolled four step wizard. That was
about 2,600 lines to be worse at a solved problem, and the skills CLI publishes a
`bin` with no `main`, so it cannot even be imported as a library. Wrapping it
would have meant shelling out to a CLI a person can type themselves.

## The two pipelines

```
build
  skills/<name>/SKILL.md
    │
    ├─ skill.mjs      SKILL.md -> frontmatter, body, sections    pure
    ├─ validate.mjs   standard + packaging -> violations         pure
    ├─ compile.mjs    replace declared blocks -> markdown        pure
    └─ write back into the same file                             [I/O]

context
  a repository
    │
    ├─ snapshot.mjs   one bounded read of the repo               [I/O]
    ├─ profile.mjs    snapshot -> signals, each with evidence    pure
    ├─ registry.mjs   signals -> the sections that apply         pure
    ├─ prefill.mjs    every value the repo already states        pure
    ├─ assemble.mjs   selected sections -> one draft             pure
    ├─ verify.mjs     re-read what the model claimed to read     pure
    └─ compare.mjs    what would change, at heading level        pure
```

Only the ends touch the world. Everything between is pure functions over
strings, tested with string literals and no fixtures, no temp directories, no
git repo, no network. For a project whose thesis is that discipline should be
checkable, the rules being the easiest thing in the codebase to test is the
point.

## Compiling in place

There is one skills directory, not a source tree and a compiled tree. `skills/`
holds what a person authors, the `standard:` declaration and any bundled files
included, and it is also what an installer reads.

The two roles are reconciled by compiling in place: `agentic build`
(`commands/build.mjs`) validates every skill, refusing the whole build on any
failure, then rewrites only the `<!-- agentic:standard -->` regions of each
`SKILL.md` via `compileInPlace`.

The alternative duplicates every skill on disk, and a reader then has to know
which of the two copies to trust. Here the file is the artifact and the build
keeps one region of it honest.

That works because injection strips any region already present before writing a
new one, so `compileInPlace` is a fixpoint over its own output. `agentic build
--check` runs the same validate and compile in memory and compares against what
is committed instead of writing, which is what CI runs. It fails on the two ways
`skills/` can go stale: a declaration or a rule family edited without a rebuild,
and a hand edit inside a generated region. Prose outside the markers is never
stale, because the file is the source.

`compile` and `compileInPlace` differ by one frontmatter key. `compile` strips
the declaration, since it is compile time metadata an agent has no use for; the
build keeps it, since the next build has to read it again. An installer that
copies carries it through as an unused key, which agents ignore.

## Module map

| Module | Owns |
|---|---|
| `cli.mjs` | Argument parsing, dispatch, exit codes, and pointing rented commands at the skills CLI |
| `commands/*.mjs` | One command each, human output, no pipeline logic |
| `skill.mjs` | The SKILL.md parser and its frontmatter dialect |
| `standard/*.mjs` | One rule family each: its prose and its checks |
| `standard/index.mjs` | Declaration parsing, invariants, the version |
| `validate.mjs` | Packaging and portability rules, plus the standard |
| `compile.mjs` | Injection and frontmatter serialization |
| `commands/build.mjs` | The publish time compile step, in place over `skills/` |
| `commands/tokens.mjs` | Session transcript accounting |
| `context/*.mjs` | The AGENTS.md pipeline above |
| `context/sections/*.mjs` | One file per section: its text and its predicate |
| `fs-util.mjs` | The filesystem questions asked repeatedly, including what counts as a bundled file |
| `ui.mjs` | Terminal output |

## Adding a rule family

1. Create `src/standard/<id>.mjs` exporting `id`, `levels`, `block(level)`, and
   `validate(skill, level)`.
2. Add it to `FAMILIES` in `src/standard/index.mjs`.
3. Add any invariant it participates in to `checkInvariants`.
4. Bump `STANDARD_VERSION`.
5. Declare the new family in every skill under `skills/`, since declaration is
   required and has no default. `npm run validate` lists what is missing. Then
   `npm run build` to regenerate the marker regions.

The generic tests in `test/standard.test.mjs` iterate `FAMILIES`, so a new
family is automatically checked for a valid `off` level, a non empty block per
level, and a heading.

## Adding a context section

Create `src/context/sections/<id>.mjs` exporting its heading, its text, and the
predicate that decides whether a project needs it, then add it to the registry.
Same rule as a standard family: the text and the condition live together, so a
section cannot claim to apply under conditions its own file does not state.

## Constraints

**Zero dependencies, permanently.** This rules out an argument parser, a colour
library, a YAML parser, and a test framework. The frontmatter dialect is small
deliberately: a skill needing more than scalars and one level of nesting is
doing too much.

**Do not rebuild what the skills CLI does.** Resolving sources, prompting, agent
paths, lockfiles, symlink or copy. If a change starts to look like installation,
it belongs in that project, not this one.

**Nothing is silently overwritten.** `build` only rewrites its own marker
regions, and `context` writes `AGENTS.generated.md` beside your `AGENTS.md`
rather than over it.
