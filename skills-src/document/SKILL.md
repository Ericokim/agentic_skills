---
name: document
description: "Run /document `pr` | `changelog` | `release-note` | `postmortem` (or let it ask) to write the human facing prose about a change. Drafts from the real commits and diff, writing to the right place for the type. Does not write code, tests, or specs."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: "[pr | changelog | release-note | postmortem]"
standard:
  evidence: tagged
  anti-hallucination: strict
  tdd: off
  review: off
  done: checklist
---

## What this skill does

Writes the prose a person reads about a change: the PR body, the changelog
entry, the release note, the postmortem. Drafted from the real commits and the
real diff, never from the conversation that produced them.

That distinction is the whole point. A chat log records what was intended. The
diff records what shipped, and those differ more often than anyone expects.

## Determine the type

- **An explicit type**, use it.
- **No type**, ask. Do not guess: the four have different readers, and a release
  note written as a changelog is useless to both.

| Type | Reader | Goes to |
|------|--------|---------|
| `pr` | the reviewer | the PR body |
| `changelog` | a developer upgrading | `CHANGELOG.md` |
| `release-note` | a user | `docs/releases/<version>.md` |
| `postmortem` | the team, later | `docs/postmortems/<date>-<slug>.md` |

## Artifact ownership

Owns the four document types above. Never writes code, tests, or specs.

## Execution

1. Read the actual change: the commit range, the diff, and the spec if one
   exists. Anything you describe has to be visible in one of those.
2. Write from the template for the type, in this skill's `templates/` folder.
3. Write for that document's reader. A user reading a release note does not care
   which module changed; a reviewer reading a PR body cares about little else.
4. Say what changed and what it means for the reader. Not how hard it was.

## What not to claim

Do not describe a behavior the diff does not show. Do not claim a fix was
verified unless a run proves it. Do not list a breaking change as a minor one
because it reads better.

An empty section is better than a padded one. If there are no breaking changes,
the honest line is that there are none.

## Completion report

Lead with what was written and where. For a PR body, print it so it can be
pasted. Do not restate the document you just wrote.
