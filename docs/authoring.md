# Authoring skills

A skill loads in full, on its path, every time it runs. Every line is a cost paid
on each invocation. Write the least that still produces the behavior, and prune
before you add.

## What earns a line

- **A line must change what the agent does.** If the agent would behave that way
  by default, the line is cost with no benefit. Delete the whole sentence, not a
  few words. Vague encouragement ("be careful", "be thorough", "think it
  through") is the usual offender.
- **Instruct, do not justify.** Skills say what to do. The reasoning and the
  history belong in the commit and the pull request, not the skill body. Keep at
  most a short clause of reason, and only where it stops the agent doing the
  wrong thing.
- **Name a concept instead of explaining it.** Standardize on terms the model
  already knows (idempotent, invariant, race condition, tracer bullet). Spell
  out only the terms this repo invented, once, in one place.
- **Steps are instructions, not narrative.** No connecting paragraphs. Each step
  is one to three lines and ends in a checkable condition.
- **State a rule once.** If a rule appears twice, cut one.

That last rule is the one this project can actually enforce, and it is why the
compiler exists. The shared discipline blocks are not something you write. You
declare them, and they are injected. Never paste an evidence or definition of
done section into a skill body: it will be injected above and below your
content, and the duplicate is pure cost.

## Frontmatter

```yaml
---
name: build                    # kebab case, must match the directory name
description: "..."             # under 400 characters, loads into every session
allowed-tools: Read, Write, Agent
argument-hint: "[what follows the command]"
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: independent
  done: checklist
---
```

`name` matching the directory is enforced, because a mismatch installs the skill
under a name nobody declared.

## Choosing levels

Declare what the skill can actually honor.

- A skill that writes code wants `tdd` on and `evidence: strict`.
- A skill that reads and reports (audit, sync) wants `evidence: strict` and
  `tdd: off`. There is nothing to test.
- A skill that plans (scope, architect) can sit at `evidence: tagged`, because
  much of its output is a recommendation rather than a claim about the repo.
- `review: independent` only where the skill can genuinely spawn a reviewer.
  Declaring it without `Agent` in `allowed-tools` is rejected.

Do not declare a level you want to be true. Declare the one the skill enforces.

## Budgets

| Budget | Limit | Why |
|---|---|---|
| `description` | 400 characters | Every installed description loads into every session |
| `SKILL.md` | 12,000 bytes | The body loads in full on every invocation |

A budget is a target with room to work in, not a high water mark. When a skill
breaches, shorten the skill. Raising a ceiling to fit the file is how a budget
stops meaning anything.

## Portability

Skills install into agent tools we do not control, on operating systems we
cannot see. The validator enforces the parts of that which are checkable:

| Rule | What it catches |
|---|---|
| `no-model-alias` | A hardcoded vendor model name. Describe the tier in role words instead. |
| `capability-first` | Naming a specific subagent tool in prose. Describe the capability. |
| `portable-shell` | Shell glue that breaks on PowerShell. Express branching as prose. |
| `no-long-dash` | Em and en dashes, which render inconsistently across tools. |
| `subagent-tool-name` | The legacy `Task` name in `allowed-tools`. Use `Agent`. |

## When to add a bundled file

Only when content is both **rarely needed and long**: an unusual mode, a
template the skill emits. Move it beside the skill and read it only when that
case arises, so it stays off the common path.

Do not split content that is short or common. Inline it. When you do split, make
the trigger explicit ("if X, read `Y` before continuing"), so the agent never
misses it.

Bundled files are copied for `claude-code`, `codex`, and `generic`. The `cursor`
target is one flat file and cannot carry them, so a skill that depends on a
bundled file installs there incomplete.

## Before committing

```bash
npm run check     # tests, the standard against skills-src/, then build --check
```

Author under `skills-src/<name>/`. `skills/` is compiled output, committed to
git so any installer finds it already compiled; never edit it by hand, and run
`npm run build` after any source change so it stays current. `build --check`
(part of `npm run check`) fails when it does not.

Reread the diff for lines that change nothing, and for a rule now stated twice.
A prune should not change behavior; if a cut might, say so and confirm it.
