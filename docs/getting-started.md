# Getting started

A first run, start to finish, assuming you have not used Agent Skills before.
About ten minutes.

By the end you will have the workflow installed in one of your own projects and
will have run the first skill against real code.

---

## What this actually is

An **Agent Skill** is a markdown file that teaches an AI coding agent how to do
one job. Your agent reads it when you type its name, the way `/audit` runs the
audit skill.

**agentic** is the installer. It fetches skills, writes an engineering standard
into them, and refuses any skill whose rules contradict each other.

You are installing nine skills that cover one job each: planning, understanding
a codebase, designing, building, verifying, testing, documenting.

---

## Before you start

| Need | Check with | If missing |
|---|---|---|
| Node 20 or newer | `node --version` | [nodejs.org](https://nodejs.org) |
| git | `git --version` | [git-scm.com](https://git-scm.com) |
| An agent tool | Claude Code, Codex, or Cursor | Any one is enough |

Run both checks at once:

```bash
node --version && git --version
```

If `node --version` prints something below `v20`, stop and upgrade. Nothing else
will work.

---

## Step 1: pick a project

Use a real project you already have, not an empty folder. These skills read your
code, and they have far less to say about an empty directory.

```bash
cd ~/path/to/your-project
```

Committing your work first is worth the ten seconds. Installing only adds files,
but a clean starting point means `git status` shows you exactly what arrived.

```bash
git status
```

---

## Step 2: set it up

```bash
npx -y github:Ericokim/agentic_skills#v0.1.0 init
```

You should see:

```text
✓ wrote skills.json
  targets: claude-code (detected)

→ next: agentic add <source>
```

`targets` is which agent tools it found. It looks for `.claude/`, `.agents/`, and
`.cursor/`. If it guessed wrong, say so directly:

```bash
npx -y github:Ericokim/agentic_skills#v0.1.0 init -t claude-code,codex
```

**What just happened.** One file, `skills.json`, now lists which tools to install
for and which skills you want. Nothing else changed.

---

## Step 3: install your first skill

Start with `audit`. It reads your project and writes the context file every other
skill depends on.

```bash
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/audit#v0.1.0
```

```text
✓ audit github:Ericokim/agentic_skills/skills/audit#v0.1.0 · 1 file
```

Check it landed:

```bash
npx -y github:Ericokim/agentic_skills#v0.1.0 list
```

```text
  SKILL  SOURCE                                       STANDARD  STATUS
  audit  github:Ericokim/agentic_skills/skills/audit  1.0.0     ✓ ok
```

`✓ ok` means the file on disk is exactly what was installed.

---

## Step 4: run it

Open your agent in this project and type:

```
/audit
```

The skill reads your package manifests, your CI config, and enough source to
describe your conventions, then writes `AGENTS.md`.

**Watch for one thing.** It runs your build and test commands rather than
assuming they work, and it writes down what actually happened. If your test
command is broken, or needs a database that is not running, `AGENTS.md` will say
so. That is the point: a command listed as working that does not work sends
every future agent down a wrong path.

Anything it could not verify is recorded as unknown rather than guessed.

---

## Step 5: install the rest

```bash
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/scope#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/architect#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/develop#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/check#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/test#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/debug#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/document#v0.1.0
npx -y github:Ericokim/agentic_skills#v0.1.0 add github:Ericokim/agentic_skills/skills/sync#v0.1.0
```

Typing that URL nine times gets old. Install the tool once instead:

```bash
npm install -D github:Ericokim/agentic_skills#v0.1.0
```

Then the command is just `agentic`, and it is much shorter:

```bash
npx agentic add github:Ericokim/agentic_skills/skills/scope#v0.1.0
```

---

## Your first real change

The skills are one per phase. A small change needs two of them, not nine.

```
/scope        what should we build, and in what order
/architect    how should it work, written down as a spec
/develop      build it
/check verify run the app and prove it works
/test         write the tests
/document pr  write the pull request
/sync         update the context files
```

A reasonable first outing on an existing project:

1. `/audit` so the agent understands your project. You did this in step 4.
2. `/scope` to see where things stand and pick the next slice.
3. `/develop <the thing>` to build it.
4. `/check verify` to watch it actually work.

Skip whatever a change does not need. A typo fix is `/develop`. A bug is
`/debug`.

---

## When something goes wrong

| What you see | What it means | Do this |
|---|---|---|
| `no skills.json here` | You have not run `init` in this directory | `cd` to the project, run `init` |
| `has local edits, so it was left alone` | You edited an installed skill by hand | Keep it, or overwrite with `--force` |
| `does not meet the standard` | The skill's rules contradict each other | Fix the skill source; the message names the rule |
| `could not find a skill named X` | Wrong name or wrong repo | The message lists what the source does provide |
| `repository not found` | Bad URL, or a private repo | Check the URL, check your git access |
| npx asks `Ok to proceed?` | You left out `-y` | Type `y`, or add `-y` |
| Agent does not see the skill | Some tools cache the skill list | Restart your agent |

Check everything at once:

```bash
npx agentic list
```

It exits non zero and names a fix for anything wrong.

---

## What is on disk now

| File | What it is | Commit it? |
|---|---|---|
| `skills.json` | Which skills you want, and for which tools. Hand editable | **yes** |
| `skills.lock` | Exact commit and hash of every installed file | **yes** |
| `.claude/skills/` | The installed skills | no, treat like `node_modules` |
| `.agents/skills/` | Same, for Codex and other clients | no |
| `AGENTS.md` | Written by `/audit`, read by every skill | **yes** |

Committing the first two means a teammate runs one command and gets exactly what
you have:

```bash
npx agentic add
```

With no argument, `add` installs everything in `skills.json` at the pinned
commit.

---

## Where to go next

| | |
|---|---|
| What each skill does in depth | [`workflow-guide.md`](workflow-guide.md) |
| The rules compiled into every skill | [`standard.md`](standard.md) |
| Writing your own skill | [`authoring.md`](authoring.md) |
| How the installer works | [`architecture.md`](architecture.md) |
