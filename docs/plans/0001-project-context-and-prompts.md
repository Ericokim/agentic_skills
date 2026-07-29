# Project context and implementation prompts: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a project specific `AGENTS.md` from repository evidence, and add an opt in prompt first mode to `develop`.

**Architecture:** A deterministic snapshot of the repository feeds a pure profiler, which produces signals with evidence. A section registry, one file per section owning its text and its predicate, decides which of the 28 blocks exist. An assembler pre-fills every fact the repository states and emits a brief listing what is left. The agent answers each open placeholder with a citation, and a verifier re-reads those citations before anything is accepted. Only the snapshot reader, the verifier's file reads, and the emitter touch the filesystem.

**Tech Stack:** Node 20+, ESM, zero dependencies, `node:test`, `node:assert/strict`.

**Spec:** `docs/specs/0001-project-context-and-prompts.md`

## Global Constraints

- **Zero dependencies, permanently.** No argument parser, no YAML parser, no test framework. Not even a dev dependency.
- **Node 20+**, ESM only (`"type": "module"`), files end in `.mjs`.
- **Test command is `npm test`**, which runs bare `node --test` and relies on Node's own test file discovery. Do not pass a quoted glob: Node only expands one itself from version 22, so a glob breaks the Node 20 leg of CI. Do not pass a bare directory either, which Node treats as a module to load.
- **Pure by default.** Only `snapshot.mjs`, the verifier's injected reader, and the emitter may touch the filesystem. Everything else takes data and returns data.
- **A module owns its text and its checks together**, the way `src/standard/*.mjs` does. Never split a section's prose from its predicate.
- **No em dashes or en dashes** in anything under `skills/`. `npm run validate` fails the build on them.
- **Named imports are sorted** within each import statement, and import statements are grouped node builtins first, then local.
- **Never overwrite a user's file.** Generation writes `AGENTS.generated.md`, never `AGENTS.md`.
- **Commit after every task.** Author as Eric, no co-author trailer, conventional commit style.

---

## File structure

| File | Responsibility |
|---|---|
| `src/context/snapshot.mjs` | I/O. Read a bounded set of interesting paths and file contents into one object |
| `src/context/profile.mjs` | Pure. Snapshot to signals, each carrying its evidence |
| `src/context/sections/*.mjs` | One file per section: its number, title, predicate, and text |
| `src/context/registry.mjs` | The section list, and selection against a profile |
| `src/context/assemble.mjs` | Pure. Selected sections plus prefills to markdown and an open placeholder list |
| `src/context/prefill.mjs` | Pure. Profile to the deterministic field values |
| `src/context/verify.mjs` | Citation checking, with the file reader injected |
| `src/context/compare.mjs` | Pure. Diff a generated file against an existing one |
| `src/commands/profile.mjs` | `agentic profile` |
| `src/commands/context.mjs` | `agentic context` |
| `skills/audit/SKILL.md` | Drives context generation |
| `skills/develop/SKILL.md` | Adds prompt first mode |
| `skills/develop/prompt-template.md` | The prompt file shape |

Tests mirror the source under `test/context/`.

---

### Task 1: Repository snapshot

**Files:**
- Create: `src/context/snapshot.mjs`
- Test: `test/context/snapshot.test.mjs`

**Interfaces:**
- Consumes: `pathExists` and `readIfPresent` from `src/fs-util.mjs`
- Produces: `takeSnapshot(root) -> Promise<{root, paths: string[], files: Record<string,string>}>`, where `paths` is every non ignored path relative to root and `files` maps a path to its contents for files matched by `INTERESTING`

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/snapshot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { takeSnapshot } from '../../src/context/snapshot.mjs';

async function repo(files) {
  const root = await mkdtemp(join(tmpdir(), 'agentic-snap-'));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), contents, 'utf8');
  }
  return root;
}

test('lists paths relative to the root', async () => {
  const root = await repo({ 'package.json': '{}', 'src/index.mjs': '' });
  const snap = await takeSnapshot(root);
  assert.ok(snap.paths.includes('package.json'));
  assert.ok(snap.paths.includes('src/index.mjs'));
});

test('reads the contents of interesting files only', async () => {
  const root = await repo({ 'package.json': '{"name":"x"}', 'src/big.mjs': 'code' });
  const snap = await takeSnapshot(root);
  assert.equal(snap.files['package.json'], '{"name":"x"}');
  assert.equal(snap.files['src/big.mjs'], undefined);
});

test('skips node_modules and dot directories', async () => {
  const root = await repo({ 'node_modules/x/package.json': '{}', '.git/config': '' });
  const snap = await takeSnapshot(root);
  assert.equal(snap.paths.length, 0);
});

test('keeps dot files that are configuration', async () => {
  const root = await repo({ '.env.example': 'DATABASE_URL=', '.gitignore': 'node_modules' });
  const snap = await takeSnapshot(root);
  assert.ok(snap.paths.includes('.env.example'));
  assert.equal(snap.files['.env.example'], 'DATABASE_URL=');
});

test('returns the root it was given', async () => {
  const root = await repo({ 'package.json': '{}' });
  assert.equal((await takeSnapshot(root)).root, root);
});

test('an unreadable root produces an empty snapshot rather than throwing', async () => {
  const snap = await takeSnapshot('/no/such/place');
  assert.deepEqual(snap.paths, []);
  assert.deepEqual(snap.files, {});
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/snapshot.test.mjs`
Expected: FAIL, `Cannot find module '../../src/context/snapshot.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/context/snapshot.mjs
// One bounded read of a repository, so every later stage is pure.
//
// Reading is capped on purpose. A profiler does not need every file, it needs
// the manifests, the configuration, and the shape of the tree. Reading more
// would make profiling slow on a large repository and would tempt later stages
// to grep source instead of asking the profile.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readIfPresent } from '../fs-util.mjs';

/** Directories never worth walking. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'target', '.next']);

/** Dot files that carry configuration worth reading. */
const KEEP_DOTFILES = new Set(['.env.example', '.env.sample', '.gitignore', '.nvmrc', '.tool-versions']);

/** Files whose contents a profiler actually reads. */
const INTERESTING = [
  /^package\.json$/,
  /^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lock)$/,
  /^(pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|composer\.json|Gemfile)$/,
  /^(Makefile|Taskfile\.ya?ml|Dockerfile.*|docker-compose.*)$/,
  /^\.github\/workflows\/.+\.ya?ml$/,
  /^(README|CONTRIBUTING)\.md$/i,
  /^(AGENTS|CLAUDE)\.md$/,
  /^skills\.(json|lock)$/,
  /^(tsconfig|next\.config|vite\.config|nuxt\.config|astro\.config)\.[a-z]+$/,
  /^\.env\.(example|sample)$/,
  /package\.json$/, // workspace manifests at any depth
];

const MAX_BYTES = 200_000;

function isInteresting(relative) {
  return INTERESTING.some((pattern) => pattern.test(relative));
}

/**
 * Read a repository into one object.
 *
 * @param {string} root
 * @returns {Promise<{root: string, paths: string[], files: Record<string,string>}>}
 */
export async function takeSnapshot(root) {
  const paths = [];
  const files = {};

  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(join(dir, entry.name), relative);
        continue;
      }
      if (entry.name.startsWith('.') && !KEEP_DOTFILES.has(entry.name)) continue;
      paths.push(relative);
      if (!isInteresting(relative)) continue;
      const contents = await readIfPresent(join(dir, entry.name));
      if (contents !== null && contents.length <= MAX_BYTES) files[relative] = contents;
    }
  };

  await walk(root, '');
  return { root, paths: paths.sort(), files };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/context/snapshot.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/context/snapshot.mjs test/context/snapshot.test.mjs
git commit -m "feat: read a repository into one bounded snapshot"
```

---

### Task 2: Profile the snapshot into signals

**Files:**
- Create: `src/context/profile.mjs`
- Test: `test/context/profile.test.mjs`

**Interfaces:**
- Consumes: the snapshot shape from Task 1
- Produces: `profile(snapshot) -> {signals: Record<string, {present: boolean, evidence: string[], detail?: object}>}`. Signal ids are exactly: `packageManager`, `languages`, `frameworks`, `database`, `httpRoutes`, `backgroundWork`, `ui`, `browserTooling`, `secrets`, `tests`, `commands`, `workflowSkills`, `librarySkills`. Every signal is always present as a key, with `present: false` and `evidence: []` when not detected.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/profile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { profile } from '../../src/context/profile.mjs';

const snap = (files, paths = []) => ({
  root: '/repo',
  paths: [...paths, ...Object.keys(files)],
  files,
});

test('every signal exists as a key even when absent', () => {
  const { signals } = profile(snap({}));
  for (const id of [
    'packageManager', 'languages', 'frameworks', 'database', 'httpRoutes',
    'backgroundWork', 'ui', 'browserTooling', 'secrets', 'tests', 'commands',
    'workflowSkills', 'librarySkills',
  ]) {
    assert.ok(id in signals, `${id} missing`);
    assert.equal(typeof signals[id].present, 'boolean');
    assert.ok(Array.isArray(signals[id].evidence));
  }
});

test('detects a database from a dependency', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"pg":"^8.0.0"}}' }));
  assert.equal(signals.database.present, true);
  assert.deepEqual(signals.database.evidence, ['package.json']);
});

test('detects a database from a migrations directory', () => {
  const { signals } = profile(snap({}, ['migrations/001_init.sql']));
  assert.equal(signals.database.present, true);
  assert.ok(signals.database.evidence.includes('migrations/001_init.sql'));
});

test('does not detect a database from nothing', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"lodash":"^4"}}' }));
  assert.equal(signals.database.present, false);
  assert.deepEqual(signals.database.evidence, []);
});

test('detects background work from a scheduler dependency', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"node-cron":"^3"}}' }));
  assert.equal(signals.backgroundWork.present, true);
});

test('detects browser tooling separately from a UI', () => {
  const { signals } = profile(snap({
    'package.json': '{"dependencies":{"react":"^19"},"devDependencies":{"@playwright/test":"^1"}}',
  }));
  assert.equal(signals.ui.present, true);
  assert.equal(signals.browserTooling.present, true);
});

test('reads commands from package scripts', () => {
  const { signals } = profile(snap({
    'package.json': '{"scripts":{"build":"tsc","test":"vitest run"}}',
  }));
  assert.equal(signals.commands.present, true);
  assert.deepEqual(signals.commands.detail, { build: 'tsc', test: 'vitest run' });
});

test('reads workflow skills from the lockfile', () => {
  const { signals } = profile(snap({
    'skills.lock': '{"develop":{"resolved":"x","sha":null,"standard":"1.0.0","files":{}}}',
  }));
  assert.equal(signals.workflowSkills.present, true);
  assert.deepEqual(signals.workflowSkills.detail, ['develop']);
});

test('malformed json does not throw, it reports absent', () => {
  const { signals } = profile(snap({ 'package.json': '{ not json' }));
  assert.equal(signals.database.present, false);
  assert.equal(signals.commands.present, false);
});

test('is pure: the same snapshot gives the same profile', () => {
  const s = snap({ 'package.json': '{"dependencies":{"pg":"^8"}}' });
  assert.deepEqual(profile(s), profile(s));
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/profile.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```javascript
// src/context/profile.mjs
// Snapshot to signals. Pure, so every detection rule is testable with a literal.
//
// Every signal carries the files that produced it. A profile that cannot say
// why it believes something is a profile nobody can check, and this one is
// shown to a person before anything is generated.

/** Dependency names that imply each signal. */
const DEPENDENCY_HINTS = {
  database: ['pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongodb', 'mongoose', 'prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'knex', '@supabase/supabase-js'],
  httpRoutes: ['express', 'fastify', 'koa', 'hapi', '@nestjs/core', 'hono'],
  backgroundWork: ['node-cron', 'bullmq', 'bull', 'agenda', 'celery', 'sidekiq', 'temporal', 'inngest', 'graphile-worker'],
  ui: ['react', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact'],
  browserTooling: ['@playwright/test', 'playwright', 'cypress', 'puppeteer', 'selenium-webdriver'],
  tests: ['vitest', 'jest', 'mocha', 'ava', 'tap', '@playwright/test'],
};

/** Path patterns that imply each signal. */
const PATH_HINTS = {
  database: [/^(migrations|db\/migrations|prisma|supabase\/migrations)\//],
  httpRoutes: [/^(app|src|pages)\/api\//, /^(routes|src\/routes)\//],
  backgroundWork: [/^(workers|jobs|src\/workers|src\/jobs)\//],
  ui: [/^(components|src\/components|app\/components)\//],
  tests: [/^(test|tests|__tests__|spec)\//, /\.(test|spec)\.[a-z]+$/],
  secrets: [/^\.env\.(example|sample)$/],
};

const empty = () => ({ present: false, evidence: [] });

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every dependency name declared anywhere in a manifest. */
function dependencyNames(manifest) {
  return [
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
    ...Object.keys(manifest?.peerDependencies ?? {}),
  ];
}

function mark(signal, evidence) {
  signal.present = true;
  if (!signal.evidence.includes(evidence)) signal.evidence.push(evidence);
}

/**
 * @param {{root: string, paths: string[], files: Record<string,string>}} snapshot
 * @returns {{signals: Record<string, {present: boolean, evidence: string[], detail?: any}>}}
 */
export function profile(snapshot) {
  const signals = {
    packageManager: empty(), languages: empty(), frameworks: empty(),
    database: empty(), httpRoutes: empty(), backgroundWork: empty(),
    ui: empty(), browserTooling: empty(), secrets: empty(), tests: empty(),
    commands: empty(), workflowSkills: empty(), librarySkills: empty(),
  };

  // Manifests, at any depth, so a monorepo workspace counts.
  for (const [path, contents] of Object.entries(snapshot.files)) {
    if (!path.endsWith('package.json')) continue;
    const manifest = parseJson(contents);
    if (!manifest) continue;

    const deps = dependencyNames(manifest);
    for (const [id, names] of Object.entries(DEPENDENCY_HINTS)) {
      if (deps.some((dep) => names.includes(dep))) mark(signals[id], path);
    }
    if (manifest.dependencies || manifest.devDependencies) {
      mark(signals.frameworks, path);
      signals.frameworks.detail = { ...(signals.frameworks.detail ?? {}), ...(manifest.dependencies ?? {}) };
    }
    if (manifest.scripts && Object.keys(manifest.scripts).length > 0) {
      mark(signals.commands, path);
      signals.commands.detail = { ...(signals.commands.detail ?? {}), ...manifest.scripts };
    }
  }

  // Lockfiles name the package manager.
  const LOCKS = { 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'yarn.lock': 'yarn', 'bun.lock': 'bun' };
  for (const [file, name] of Object.entries(LOCKS)) {
    if (snapshot.files[file] !== undefined || snapshot.paths.includes(file)) {
      mark(signals.packageManager, file);
      signals.packageManager.detail = name;
    }
  }

  // Paths.
  for (const path of snapshot.paths) {
    for (const [id, patterns] of Object.entries(PATH_HINTS)) {
      if (patterns.some((pattern) => pattern.test(path))) mark(signals[id], path);
    }
    if (path.startsWith('.claude/skills/') || path.startsWith('.agents/skills/')) {
      const name = path.split('/')[2];
      if (name) {
        mark(signals.librarySkills, path);
        const seen = new Set(signals.librarySkills.detail ?? []);
        seen.add(name);
        signals.librarySkills.detail = [...seen].sort();
      }
    }
    if (/\.(ts|tsx)$/.test(path)) { mark(signals.languages, path); signals.languages.detail = 'typescript'; }
  }

  // Environment samples name secrets.
  const envSample = snapshot.files['.env.example'] ?? snapshot.files['.env.sample'];
  if (envSample) {
    mark(signals.secrets, snapshot.files['.env.example'] ? '.env.example' : '.env.sample');
    signals.secrets.detail = envSample
      .split('\n')
      .map((line) => line.split('=')[0].trim())
      .filter((key) => key && !key.startsWith('#'));
    if (signals.secrets.detail.some((key) => /DATABASE|POSTGRES|MYSQL|MONGO/i.test(key))) {
      mark(signals.database, '.env.example');
    }
  }

  // Our own lockfile names the workflow skills exactly.
  const lock = parseJson(snapshot.files['skills.lock'] ?? '');
  if (lock && Object.keys(lock).length > 0) {
    mark(signals.workflowSkills, 'skills.lock');
    signals.workflowSkills.detail = Object.keys(lock).sort();
  }

  // CI workflows are a second source for commands.
  for (const path of Object.keys(snapshot.files)) {
    if (path.startsWith('.github/workflows/')) mark(signals.commands, path);
  }

  return { signals };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/context/profile.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/context/profile.mjs test/context/profile.test.mjs
git commit -m "feat: profile a snapshot into signals that carry their evidence"
```

---

### Task 3: Section module shape and the registry

**Files:**
- Create: `src/context/sections/product.mjs`, `src/context/sections/tech-stack.mjs`, `src/context/sections/data-platform.mjs`
- Create: `src/context/registry.mjs`
- Test: `test/context/registry.test.mjs`

**Interfaces:**
- Consumes: the profile shape from Task 2
- Produces: every section module exports `id: string`, `number: number|null`, `title: string`, `when(signals) -> boolean`, and `text(signals) -> string` containing `{{PLACEHOLDER}}` tokens. `text` takes the signals so a section can vary its wording on what the project has, which section 2 needs. `registry.mjs` exports `SECTIONS` (ordered by `number`, nulls last in declared order) and `selectSections(profileResult) -> {included: Section[], skipped: {id, title, reason}[]}`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/registry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SECTIONS, selectSections } from '../../src/context/registry.mjs';

const signals = (on = {}) => {
  const ids = ['packageManager','languages','frameworks','database','httpRoutes',
    'backgroundWork','ui','browserTooling','secrets','tests','commands',
    'workflowSkills','librarySkills'];
  return Object.fromEntries(ids.map((id) => [id, { present: Boolean(on[id]), evidence: [] }]));
};

test('every section declares the required exports', () => {
  for (const section of SECTIONS) {
    assert.equal(typeof section.id, 'string', 'id');
    assert.ok(section.number === null || typeof section.number === 'number', section.id);
    assert.equal(typeof section.title, 'string', section.id);
    assert.equal(typeof section.when, 'function', section.id);
    assert.equal(typeof section.text, 'function', section.id);
    assert.ok(section.text(signals()).length > 0, `${section.id} text is empty`);
  }
});

test('section ids are unique', () => {
  const ids = SECTIONS.map((s) => s.id);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test('numbered sections are ordered by number', () => {
  const numbers = SECTIONS.map((s) => s.number).filter((n) => n !== null);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
});

test('always sections are selected for an empty profile', () => {
  const { included } = selectSections({ signals: signals() });
  assert.ok(included.some((s) => s.id === 'product'));
  assert.ok(included.some((s) => s.id === 'tech-stack'));
});

test('a conditional section is skipped with a reason', () => {
  const { included, skipped } = selectSections({ signals: signals() });
  assert.ok(!included.some((s) => s.id === 'data-platform'));
  const entry = skipped.find((s) => s.id === 'data-platform');
  assert.ok(entry, 'expected data-platform in skipped');
  assert.match(entry.reason, /database/);
});

test('a conditional section is included when its signal is present', () => {
  const { included } = selectSections({ signals: signals({ database: true }) });
  assert.ok(included.some((s) => s.id === 'data-platform'));
});

test('selection is pure', () => {
  const p = { signals: signals({ database: true }) };
  assert.deepEqual(selectSections(p).included.map((s) => s.id), selectSections(p).included.map((s) => s.id));
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/registry.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the three section modules**

```javascript
// src/context/sections/product.mjs
// What this project is for, and what it deliberately does not do.

export const id = 'product';
export const number = 1;
export const title = 'Product';
export const when = () => true;

export function text() {
  return `# 1. Product

{{PRODUCT_SUMMARY}}

Build only:

{{CORE_FEATURES}}

Do not overbuild.

Explicitly out of scope:

{{OUT_OF_SCOPE}}`;
}
```

```javascript
// src/context/sections/tech-stack.mjs
// The stack, taken from manifests rather than from what the code looks like.

export const id = 'tech-stack';
export const number = 6;
export const title = 'Tech stack';
export const when = () => true;

export function text() {
  return `# 6. Tech stack

{{STACK_TABLE}}

Package manager: {{PACKAGE_MANAGER}}

Before writing framework specific code, inspect the installed version and read
the local documentation for it. Do not rely on memory alone.`;
}
```

```javascript
// src/context/sections/data-platform.mjs
// Where data actually lives, and which access path is authoritative.

export const id = 'data-platform';
export const number = 7;
export const title = 'Data platform source of truth';
export const when = (signals) => signals.database.present;
export const requires = 'a database';

export function text() {
  return `# 7. {{DATA_PLATFORM}} source of truth

{{DATA_PLATFORM}} is the source of truth for {{PRIMARY_RECORD_NAME}}.

- Schema changes go through migrations in {{MIGRATIONS_PATH}}.
- {{PRIVILEGED_ACCESS_RULE}}
- Never read or write around the data layer.`;
}
```

- [ ] **Step 4: Write the registry**

```javascript
// src/context/registry.mjs
// The section list, and selection against a profile.
//
// A section owns its text and its predicate in one file, the same shape as a
// rule family in src/standard/. Splitting them is how a section ends up
// claiming to apply in a case its text does not cover.

import * as dataPlatform from './sections/data-platform.mjs';
import * as product from './sections/product.mjs';
import * as techStack from './sections/tech-stack.mjs';

/** Ordered by section number, unnumbered blocks last in declared order. */
export const SECTIONS = [product, techStack, dataPlatform].sort((a, b) => {
  if (a.number === null && b.number === null) return 0;
  if (a.number === null) return 1;
  if (b.number === null) return -1;
  return a.number - b.number;
});

/**
 * Which sections this repository gets, and why the rest were left out.
 *
 * A section that does not apply is absent rather than filled with Unknown, and
 * the reason is reported so nobody has to guess whether it was skipped or
 * missed.
 */
export function selectSections({ signals }) {
  const included = [];
  const skipped = [];
  for (const section of SECTIONS) {
    if (section.when(signals)) included.push(section);
    else skipped.push({ id: section.id, title: section.title, reason: `no ${section.requires ?? 'matching evidence'}` });
  }
  return { included, skipped };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `node --test test/context/registry.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/context/registry.mjs src/context/sections test/context/registry.test.mjs
git commit -m "feat: section registry, each section owning its text and predicate"
```

---

### Task 4: The remaining 25 sections

**Files:**
- Create: one file per row in the table below, under `src/context/sections/`
- Modify: `src/context/registry.mjs` to import and list all 28
- Test: `test/context/registry.test.mjs` (extend)

**Interfaces:**
- Consumes: the module shape from Task 3
- Produces: `SECTIONS.length === 28`. Each module exports the same five names, plus `requires: string` on any section whose `when` is not `() => true`.

Every file follows the exact shape shown in Task 3: five exports, `text()` returning the section body with `{{PLACEHOLDER}}` tokens, and a `requires` string naming the evidence when conditional. Section bodies come from the source template, with fixed arity placeholders replaced by a single list token (`{{CORE_FEATURES}}` rather than `CORE_FEATURE_1` through `CORE_FEATURE_10`).

| File | number | id | `when(signals)` | `requires` |
|---|---|---|---|---|
| `header.mjs` | null | `header` | `() => true` | |
| `framework-warning.mjs` | null | `framework-warning` | `() => true` | |
| `workflow.mjs` | 2 | `workflow` | `() => true` | |
| `skills.mjs` | 3 | `skills` | `() => true` | |
| `prompt-files.mjs` | 4 | `prompt-files` | `() => true` | |
| `architecture.mjs` | 5 | `architecture` | `() => true` | |
| `source-selection.mjs` | 8 | `source-selection` | `(s) => s.backgroundWork.present && s.database.present` | `background work and a database` |
| `process-model.mjs` | 9 | `process-model` | `(s) => s.backgroundWork.present && s.database.present` | `background work and a database` |
| `storage-rules.mjs` | 10 | `storage-rules` | `(s) => s.database.present` | `a database` |
| `input-extraction.mjs` | 11 | `input-extraction` | `(s) => s.backgroundWork.present` | `background work` |
| `candidate-filtering.mjs` | 12 | `candidate-filtering` | `(s) => s.backgroundWork.present && s.database.present` | `background work and a database` |
| `record-validation.mjs` | 13 | `record-validation` | `(s) => s.database.present` | `a database` |
| `api-routes.mjs` | 14 | `api-routes` | `(s) => s.httpRoutes.present` | `HTTP routes` |
| `privileged-access.mjs` | 15 | `privileged-access` | `(s) => s.secrets.present` | `secrets or roles` |
| `manual-runs.mjs` | 16 | `manual-runs` | `(s) => s.backgroundWork.present` | `background work` |
| `testing-output.mjs` | 17 | `testing-output` | `() => true` | |
| `scheduler.mjs` | 18 | `scheduler` | `(s) => s.backgroundWork.present` | `background work` |
| `domain-processor.mjs` | 19 | `domain-processor` | `(s) => s.ui.present && s.database.present` | `a UI and a domain model` |
| `advanced-capability.mjs` | 20 | `advanced-capability` | `(s) => s.backgroundWork.present && s.ui.present` | `background work and a UI` |
| `security.mjs` | 21 | `security` | `() => true` | |
| `commands.mjs` | 22 | `commands` | `() => true` | |
| `visual-testing.mjs` | 23 | `visual-testing` | `(s) => s.ui.present && s.browserTooling.present` | `a UI and browser tooling` |
| `definition-of-done.mjs` | null | `definition-of-done` | `() => true` | |
| `completion-report.mjs` | null | `completion-report` | `() => true` | |
| `operating-sequence.mjs` | null | `operating-sequence` | `() => true` | |

- [ ] **Step 1: Write the failing test**

```javascript
// append to test/context/registry.test.mjs
test('the registry holds all 28 blocks', () => {
  assert.equal(SECTIONS.length, 28);
});

test('14 blocks are always included and 14 are conditional', () => {
  const always = SECTIONS.filter((s) => s.when(signals())).length;
  assert.equal(always, 14);
  assert.equal(SECTIONS.length - always, 14);
});

test('every conditional section names what it requires', () => {
  for (const section of SECTIONS) {
    if (section.when(signals())) continue;
    assert.equal(typeof section.requires, 'string', `${section.id} has no requires`);
    assert.ok(section.requires.length > 0, section.id);
  }
});

test('a full profile selects all 28', () => {
  const all = signals({
    database: true, httpRoutes: true, backgroundWork: true, ui: true,
    browserTooling: true, secrets: true,
  });
  assert.equal(selectSections({ signals: all }).included.length, 28);
});

test('no section text contains a fixed arity placeholder', () => {
  for (const section of SECTIONS) {
    assert.doesNotMatch(section.text(signals()), /\{\{[A-Z_]+_\d+\}\}/, `${section.id} has a numbered placeholder`);
  }
});

test('the workflow section names the installed skills when there are any', () => {
  const withSkills = signals({ workflowSkills: true });
  const workflow = SECTIONS.find((s) => s.id === 'workflow');
  assert.match(workflow.text(withSkills), /\/develop/);
  assert.doesNotMatch(workflow.text(signals()), /\/develop/);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/registry.test.mjs`
Expected: FAIL, `Expected values to be strictly equal: 3 !== 28`

- [ ] **Step 3: Create the 25 remaining section files**

Each follows the Task 3 shape exactly. Example for a conditional one:

```javascript
// src/context/sections/api-routes.mjs
// How HTTP handlers must behave, so route code does not drift per file.

export const id = 'api-routes';
export const number = 14;
export const title = 'API route method rules';
export const when = (signals) => signals.httpRoutes.present;
export const requires = 'HTTP routes';

export function text() {
  return `# 14. API route method rules

{{ROUTE_CONVENTIONS}}

- Validate input at the boundary before any work happens.
- Return the documented status codes, not a generic 500 for expected failures.
- Authorize at the route, not only in the interface that calls it.`;
}
```

And for an always one:

```javascript
// src/context/sections/commands.mjs
// The commands a maintainer actually runs, verified rather than assumed.

export const id = 'commands';
export const number = 22;
export const title = 'Commands and checks';
export const when = () => true;

export function text() {
  return `# 22. Commands and checks

{{COMMANDS_TABLE}}

{{COMMAND_VERIFICATION_NOTE}}

Run the checks before claiming a change is complete, and show the output.`;
}
```

- [ ] **Step 4: Update the registry imports**

```javascript
// src/context/registry.mjs, replace the import block and SECTIONS
import * as advancedCapability from './sections/advanced-capability.mjs';
import * as apiRoutes from './sections/api-routes.mjs';
import * as architecture from './sections/architecture.mjs';
import * as candidateFiltering from './sections/candidate-filtering.mjs';
import * as commands from './sections/commands.mjs';
import * as completionReport from './sections/completion-report.mjs';
import * as dataPlatform from './sections/data-platform.mjs';
import * as definitionOfDone from './sections/definition-of-done.mjs';
import * as domainProcessor from './sections/domain-processor.mjs';
import * as frameworkWarning from './sections/framework-warning.mjs';
import * as header from './sections/header.mjs';
import * as inputExtraction from './sections/input-extraction.mjs';
import * as manualRuns from './sections/manual-runs.mjs';
import * as operatingSequence from './sections/operating-sequence.mjs';
import * as privilegedAccess from './sections/privileged-access.mjs';
import * as processModel from './sections/process-model.mjs';
import * as product from './sections/product.mjs';
import * as promptFiles from './sections/prompt-files.mjs';
import * as recordValidation from './sections/record-validation.mjs';
import * as scheduler from './sections/scheduler.mjs';
import * as security from './sections/security.mjs';
import * as skills from './sections/skills.mjs';
import * as sourceSelection from './sections/source-selection.mjs';
import * as storageRules from './sections/storage-rules.mjs';
import * as techStack from './sections/tech-stack.mjs';
import * as testingOutput from './sections/testing-output.mjs';
import * as visualTesting from './sections/visual-testing.mjs';
import * as workflow from './sections/workflow.mjs';

const ALL = [
  header, frameworkWarning, product, workflow, skills, promptFiles, architecture,
  techStack, dataPlatform, sourceSelection, processModel, storageRules,
  inputExtraction, candidateFiltering, recordValidation, apiRoutes,
  privilegedAccess, manualRuns, testingOutput, scheduler, domainProcessor,
  advancedCapability, security, commands, visualTesting, definitionOfDone,
  completionReport, operatingSequence,
];

export const SECTIONS = ALL;
```

Note: `header` and `framework-warning` carry `number: null` and must sort before section 1, so replace the sort with the explicit order above rather than sorting. The declared order in `ALL` is the emitted order.

- [ ] **Step 5: Run the test and watch it pass**

Run: `node --test test/context/registry.test.mjs`
Expected: PASS, 12 tests

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add src/context/sections src/context/registry.mjs test/context/registry.test.mjs
git commit -m "feat: all 28 context sections with their predicates"
```

---

### Task 5: Pre-fill the deterministic fields

**Files:**
- Create: `src/context/prefill.mjs`
- Test: `test/context/prefill.test.mjs`

**Interfaces:**
- Consumes: the profile from Task 2
- Produces: `prefill(profileResult) -> Record<string, string>` mapping placeholder names (without braces) to their values. Keys produced: `STACK_TABLE`, `PACKAGE_MANAGER`, `COMMANDS_TABLE`, `WORKFLOW_SKILLS`, `LIBRARY_SKILLS`, `MIGRATIONS_PATH`. Absent facts are simply not keyed, so the assembler treats them as open.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/prefill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prefill } from '../../src/context/prefill.mjs';

const p = (signals) => ({ signals });
const sig = (over = {}) => ({
  packageManager: { present: false, evidence: [] },
  commands: { present: false, evidence: [] },
  frameworks: { present: false, evidence: [] },
  workflowSkills: { present: false, evidence: [] },
  librarySkills: { present: false, evidence: [] },
  database: { present: false, evidence: [] },
  ...over,
});

test('fills the package manager when detected', () => {
  const out = prefill(p(sig({ packageManager: { present: true, evidence: ['package-lock.json'], detail: 'npm' } })));
  assert.equal(out.PACKAGE_MANAGER, 'npm');
});

test('leaves an undetected fact unkeyed rather than guessing', () => {
  const out = prefill(p(sig()));
  assert.equal('PACKAGE_MANAGER' in out, false);
});

test('renders commands as a markdown table', () => {
  const out = prefill(p(sig({
    commands: { present: true, evidence: ['package.json'], detail: { test: 'vitest run', build: 'tsc' } },
  })));
  assert.match(out.COMMANDS_TABLE, /\| Command \| Runs \|/);
  assert.match(out.COMMANDS_TABLE, /`npm run build` \| `tsc`/);
  assert.match(out.COMMANDS_TABLE, /`npm test` \| `vitest run`/);
});

test('renders workflow skills as a list', () => {
  const out = prefill(p(sig({
    workflowSkills: { present: true, evidence: ['skills.lock'], detail: ['audit', 'develop'] },
  })));
  assert.match(out.WORKFLOW_SKILLS, /- `\/audit`/);
  assert.match(out.WORKFLOW_SKILLS, /- `\/develop`/);
});

test('is pure', () => {
  const input = p(sig({ packageManager: { present: true, evidence: [], detail: 'pnpm' } }));
  assert.deepEqual(prefill(input), prefill(input));
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/prefill.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```javascript
// src/context/prefill.mjs
// Every value the repository already states, written without asking a model.
//
// This is the strongest anti-hallucination control available: a field that is
// never offered to a model cannot be invented by one. Roughly sixty percent of
// the placeholders are facts sitting in manifests and lockfiles.

/** `npm test` rather than `npm run test`, which is what people actually type. */
function commandFor(name, script) {
  const bare = ['test', 'start'];
  return { command: bare.includes(name) ? `npm ${name}` : `npm run ${name}`, script };
}

function commandsTable(scripts) {
  const rows = Object.entries(scripts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, script]) => {
      const { command, script: value } = commandFor(name, script);
      return `| \`${command}\` | \`${value}\` |`;
    });
  return ['| Command | Runs |', '|---|---|', ...rows].join('\n');
}

/**
 * @param {{signals: Record<string, {present: boolean, evidence: string[], detail?: any}>}} profileResult
 * @returns {Record<string, string>}
 */
export function prefill({ signals }) {
  const out = {};

  if (signals.packageManager.present && signals.packageManager.detail) {
    out.PACKAGE_MANAGER = signals.packageManager.detail;
  }

  if (signals.commands.present && signals.commands.detail) {
    out.COMMANDS_TABLE = commandsTable(signals.commands.detail);
  }

  if (signals.frameworks.present && signals.frameworks.detail) {
    const rows = Object.entries(signals.frameworks.detail)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, version]) => `| \`${name}\` | ${version} |`);
    out.STACK_TABLE = ['| Package | Version |', '|---|---|', ...rows].join('\n');
  }

  if (signals.workflowSkills.present && signals.workflowSkills.detail) {
    out.WORKFLOW_SKILLS = signals.workflowSkills.detail.map((name) => `- \`/${name}\``).join('\n');
  }

  if (signals.librarySkills.present && signals.librarySkills.detail) {
    out.LIBRARY_SKILLS = signals.librarySkills.detail.map((name) => `- \`${name}\``).join('\n');
  }

  if (signals.database.present) {
    const migrations = signals.database.evidence.find((path) => path.includes('migrations'));
    if (migrations) out.MIGRATIONS_PATH = migrations.split('/').slice(0, -1).join('/');
  }

  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/context/prefill.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/context/prefill.mjs test/context/prefill.test.mjs
git commit -m "feat: pre-fill every field the repository already states"
```

---

### Task 6: Assemble the draft and the brief

**Files:**
- Create: `src/context/assemble.mjs`
- Test: `test/context/assemble.test.mjs`

**Interfaces:**
- Consumes: `selectSections` from Task 3, `prefill` from Task 5
- Produces: `assemble({profileResult, values}) -> {markdown: string, open: {name: string, section: string}[], skipped: {id, title, reason}[], bytes: number}`. `open` lists every placeholder still unfilled, in document order, deduplicated by name.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/assemble.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assemble } from '../../src/context/assemble.mjs';

const sig = (on = {}) => {
  const ids = ['packageManager','languages','frameworks','database','httpRoutes',
    'backgroundWork','ui','browserTooling','secrets','tests','commands',
    'workflowSkills','librarySkills'];
  return Object.fromEntries(ids.map((id) => [id, { present: Boolean(on[id]), evidence: [] }]));
};

test('emits only the sections the profile selected', () => {
  const { markdown } = assemble({ profileResult: { signals: sig() }, values: {} });
  assert.match(markdown, /# 1\. Product/);
  assert.doesNotMatch(markdown, /source of truth/);
});

test('substitutes a provided value', () => {
  const { markdown } = assemble({
    profileResult: { signals: sig() },
    values: { PACKAGE_MANAGER: 'pnpm' },
  });
  assert.match(markdown, /Package manager: pnpm/);
  assert.doesNotMatch(markdown, /\{\{PACKAGE_MANAGER\}\}/);
});

test('reports every unfilled placeholder as open', () => {
  const { open } = assemble({ profileResult: { signals: sig() }, values: {} });
  assert.ok(open.some((o) => o.name === 'PRODUCT_SUMMARY'));
  assert.ok(open.every((o) => typeof o.section === 'string'));
});

test('an open placeholder is listed once even when it appears twice', () => {
  const { open } = assemble({ profileResult: { signals: sig({ database: true }) }, values: {} });
  const names = open.map((o) => o.name);
  assert.deepEqual(names, [...new Set(names)]);
});

test('reports the skipped sections and their reasons', () => {
  const { skipped } = assemble({ profileResult: { signals: sig() }, values: {} });
  assert.ok(skipped.some((s) => s.id === 'data-platform' && /database/.test(s.reason)));
});

test('reports the byte size of the result', () => {
  const out = assemble({ profileResult: { signals: sig() }, values: {} });
  assert.equal(out.bytes, Buffer.byteLength(out.markdown, 'utf8'));
});

test('sections are separated by a horizontal rule', () => {
  const { markdown } = assemble({ profileResult: { signals: sig() }, values: {} });
  assert.ok(markdown.includes('\n---\n'));
});

test('is deterministic', () => {
  const args = { profileResult: { signals: sig({ database: true }) }, values: { PACKAGE_MANAGER: 'npm' } };
  assert.equal(assemble(args).markdown, assemble(args).markdown);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/assemble.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```javascript
// src/context/assemble.mjs
// Selected sections plus known values to one flat markdown file.
//
// One file, deliberately. A tiered split would cut the always loaded size, but
// it costs a reader the ability to open one file and see the whole contract,
// and it makes every skill's instruction to read AGENTS.md only partly true.

import { selectSections } from './registry.mjs';

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

/**
 * @param {{profileResult: object, values: Record<string,string>}} input
 * @returns {{markdown: string, open: {name: string, section: string}[], skipped: object[], bytes: number}}
 */
export function assemble({ profileResult, values = {} }) {
  const { included, skipped } = selectSections(profileResult);
  const open = [];
  const seen = new Set();

  const bodies = included.map((section) => {
    const filled = section.text(profileResult.signals).replace(PLACEHOLDER, (match, name) => {
      if (Object.hasOwn(values, name)) return values[name];
      if (!seen.has(name)) {
        seen.add(name);
        open.push({ name, section: section.id });
      }
      return match;
    });
    return filled.trim();
  });

  const markdown = `${bodies.join('\n\n---\n\n')}\n`;
  return { markdown, open, skipped, bytes: Buffer.byteLength(markdown, 'utf8') };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/context/assemble.test.mjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/context/assemble.mjs test/context/assemble.test.mjs
git commit -m "feat: assemble selected sections into one flat draft"
```

---

### Task 7: Verify citations

**Files:**
- Create: `src/context/verify.mjs`
- Test: `test/context/verify.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `verifyAnswers(answers, read) -> Promise<{accepted: Record<string,string>, downgraded: {name, reason}[]}>`. `answers` is `{NAME: {value: string, evidence: string[]}}` where each evidence entry is `path` or `path:line` or `path:from-to`. `read(path)` returns file contents or null.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyAnswers } from '../../src/context/verify.mjs';

const reader = (files) => async (path) => files[path] ?? null;

test('accepts a value whose citation resolves', async () => {
  const read = reader({ 'README.md': 'A course management system\n' });
  const { accepted, downgraded } = await verifyAnswers(
    { PRODUCT_SUMMARY: { value: 'A course management system', evidence: ['README.md'] } },
    read,
  );
  assert.equal(accepted.PRODUCT_SUMMARY, 'A course management system');
  assert.deepEqual(downgraded, []);
});

test('downgrades a value whose file does not exist', async () => {
  const { accepted, downgraded } = await verifyAnswers(
    { X: { value: 'anything', evidence: ['nope.md'] } },
    reader({}),
  );
  assert.equal(accepted.X, 'Unknown');
  assert.equal(downgraded[0].name, 'X');
  assert.match(downgraded[0].reason, /nope\.md/);
});

test('downgrades a value the cited file does not contain', async () => {
  const { accepted, downgraded } = await verifyAnswers(
    { X: { value: 'hospitals', evidence: ['README.md'] } },
    reader({ 'README.md': 'a system for schools' }),
  );
  assert.equal(accepted.X, 'Unknown');
  assert.match(downgraded[0].reason, /not found in/);
});

test('downgrades a value with no citation at all', async () => {
  const { accepted, downgraded } = await verifyAnswers({ X: { value: 'v', evidence: [] } }, reader({}));
  assert.equal(accepted.X, 'Unknown');
  assert.match(downgraded[0].reason, /no citation/);
});

test('accepts when any one citation resolves', async () => {
  const read = reader({ 'b.md': 'the value' });
  const { accepted } = await verifyAnswers(
    { X: { value: 'the value', evidence: ['a.md', 'b.md'] } },
    read,
  );
  assert.equal(accepted.X, 'the value');
});

test('a line range citation is checked against that range only', async () => {
  const read = reader({ 'a.md': 'line one\nthe value\nline three' });
  const hit = await verifyAnswers({ X: { value: 'the value', evidence: ['a.md:2'] } }, read);
  assert.equal(hit.accepted.X, 'the value');
  const miss = await verifyAnswers({ X: { value: 'the value', evidence: ['a.md:3'] } }, read);
  assert.equal(miss.accepted.X, 'Unknown');
});

test('matching ignores case and surrounding whitespace', async () => {
  const read = reader({ 'a.md': '   A Course Management System   ' });
  const { accepted } = await verifyAnswers(
    { X: { value: 'a course management system', evidence: ['a.md'] } },
    read,
  );
  assert.equal(accepted.X, 'a course management system');
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/verify.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```javascript
// src/context/verify.mjs
// Re-read what the model claimed to have read.
//
// Instructions not to hallucinate are the weakest control available. This is
// the strong one: a value survives only when the file it cites still contains
// it. What this cannot catch is a plausible but wrong summary, and nothing
// mechanical can, which is why the output is always shown as a diff.

/** `path`, `path:12`, or `path:12-40`. */
function parseCitation(citation) {
  const match = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(citation.trim());
  if (!match) return { path: citation, from: null, to: null };
  const [, path, from, to] = match;
  return { path, from: from ? Number(from) : null, to: to ? Number(to) : null };
}

const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {Record<string, {value: string, evidence: string[]}>} answers
 * @param {(path: string) => Promise<string|null>} read
 */
export async function verifyAnswers(answers, read) {
  const accepted = {};
  const downgraded = [];

  for (const [name, answer] of Object.entries(answers)) {
    const evidence = answer.evidence ?? [];
    if (evidence.length === 0) {
      accepted[name] = 'Unknown';
      downgraded.push({ name, reason: 'no citation was given' });
      continue;
    }

    let resolved = false;
    const misses = [];
    for (const citation of evidence) {
      const { path, from, to } = parseCitation(citation);
      const contents = await read(path);
      if (contents === null) {
        misses.push(`${path} does not exist`);
        continue;
      }
      const lines = contents.split('\n');
      const slice = from === null ? contents : lines.slice(from - 1, (to ?? from)).join('\n');
      if (normalize(slice).includes(normalize(answer.value))) {
        resolved = true;
        break;
      }
      misses.push(`not found in ${citation}`);
    }

    if (resolved) accepted[name] = answer.value;
    else {
      accepted[name] = 'Unknown';
      downgraded.push({ name, reason: misses.join(', ') });
    }
  }

  return { accepted, downgraded };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/context/verify.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/context/verify.mjs test/context/verify.test.mjs
git commit -m "feat: verify every cited value by re-reading its source"
```

---

### Task 8: Compare against an existing file

**Files:**
- Create: `src/context/compare.mjs`
- Test: `test/context/compare.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `compare(existing, generated) -> {added: string[], removed: string[], kept: number}`, operating on top level section headings so the report is readable rather than a line diff.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/compare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compare } from '../../src/context/compare.mjs';

test('reports headings only the generated file has', () => {
  const out = compare('# 1. Product\n', '# 1. Product\n\n# 6. Tech stack\n');
  assert.deepEqual(out.added, ['6. Tech stack']);
  assert.deepEqual(out.removed, []);
  assert.equal(out.kept, 1);
});

test('reports headings only the existing file has', () => {
  const out = compare('# 1. Product\n\n# 9. Custom rules\n', '# 1. Product\n');
  assert.deepEqual(out.removed, ['9. Custom rules']);
});

test('an empty existing file makes everything added', () => {
  const out = compare('', '# 1. Product\n');
  assert.deepEqual(out.added, ['1. Product']);
  assert.equal(out.kept, 0);
});

test('identical files report no change', () => {
  const same = '# 1. Product\n\n# 6. Tech stack\n';
  const out = compare(same, same);
  assert.deepEqual(out.added, []);
  assert.deepEqual(out.removed, []);
  assert.equal(out.kept, 2);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/compare.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```javascript
// src/context/compare.mjs
// What would change, at the level a person reads.
//
// A line diff of a 20 KB file is unreadable and nobody checks it. Comparing top
// level headings answers the question that matters before overwriting anything:
// what would I gain, and what would I lose.

const headings = (markdown) =>
  markdown
    .split('\n')
    .map((line) => /^#\s+(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => match[1].trim());

/**
 * @param {string} existing
 * @param {string} generated
 * @returns {{added: string[], removed: string[], kept: number}}
 */
export function compare(existing, generated) {
  const before = new Set(headings(existing));
  const after = new Set(headings(generated));
  return {
    added: [...after].filter((h) => !before.has(h)),
    removed: [...before].filter((h) => !after.has(h)),
    kept: [...after].filter((h) => before.has(h)).length,
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/context/compare.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/context/compare.mjs test/context/compare.test.mjs
git commit -m "feat: compare a generated context file against an existing one"
```

---

### Task 9: The `profile` and `context` commands

**Files:**
- Create: `src/commands/profile.mjs`, `src/commands/context.mjs`
- Modify: `src/cli.mjs` (imports, USAGE, switch)
- Test: `test/context/commands.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 5, 6, 8
- Produces: `profileCommand({root}) -> Promise<number>` and `contextCommand({root, plan}) -> Promise<number>`. `context` writes `AGENTS.draft.md` and `AGENTS.brief.md` into the root and returns 0, or 1 when the root cannot be read.

- [ ] **Step 1: Write the failing test**

```javascript
// test/context/commands.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { context as contextCommand } from '../../src/commands/context.mjs';
import { profile as profileCommand } from '../../src/commands/profile.mjs';

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'agentic-cmd-'));
  await writeFile(join(root, 'package.json'), '{"scripts":{"test":"node --test"}}', 'utf8');
  return root;
}

test('profile exits 0 on a readable repository', async () => {
  assert.equal(await profileCommand({ root: await repo() }), 0);
});

test('context writes a draft and a brief', async () => {
  const root = await repo();
  assert.equal(await contextCommand({ root, plan: true }), 0);
  const draft = await readFile(join(root, 'AGENTS.draft.md'), 'utf8');
  const brief = await readFile(join(root, 'AGENTS.brief.md'), 'utf8');
  assert.match(draft, /# 1\. Product/);
  assert.match(brief, /PRODUCT_SUMMARY/);
});

test('context never writes AGENTS.md', async () => {
  const root = await repo();
  await writeFile(join(root, 'AGENTS.md'), 'curated by a person\n', 'utf8');
  await contextCommand({ root, plan: true });
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), 'curated by a person\n');
});

test('running twice produces an identical draft', async () => {
  const root = await repo();
  await contextCommand({ root, plan: true });
  const first = await readFile(join(root, 'AGENTS.draft.md'), 'utf8');
  await contextCommand({ root, plan: true });
  assert.equal(await readFile(join(root, 'AGENTS.draft.md'), 'utf8'), first);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/context/commands.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Write the commands**

```javascript
// src/commands/profile.mjs
import { profile as buildProfile } from '../context/profile.mjs';
import { takeSnapshot } from '../context/snapshot.mjs';
import { bold, dim, line, symbol, table } from '../ui.mjs';

/** Print what was detected and the file that proved it. */
export async function profile({ root }) {
  const snapshot = await takeSnapshot(root);
  if (snapshot.paths.length === 0) {
    line(`${symbol.fail} nothing readable at ${root}`);
    return 1;
  }

  const { signals } = buildProfile(snapshot);
  const rows = [[dim('SIGNAL'), dim('DETECTED'), dim('EVIDENCE')]];
  for (const [id, signal] of Object.entries(signals)) {
    rows.push([
      bold(id),
      signal.present ? `${symbol.ok} yes` : dim('no'),
      signal.evidence.slice(0, 2).join(', ') || dim('-'),
    ]);
  }
  line();
  table(rows);
  line();
  return 0;
}
```

```javascript
// src/commands/context.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assemble } from '../context/assemble.mjs';
import { compare } from '../context/compare.mjs';
import { prefill } from '../context/prefill.mjs';
import { profile as buildProfile } from '../context/profile.mjs';
import { takeSnapshot } from '../context/snapshot.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Plan a context file: select sections, pre-fill facts, and say what is left.
 *
 * Writes a draft and a brief. Never writes AGENTS.md, because a context file a
 * person curated is worth more than one a tool generated.
 */
export async function context({ root, plan = true }) {
  const snapshot = await takeSnapshot(root);
  if (snapshot.paths.length === 0) {
    line(`${symbol.fail} nothing readable at ${root}`);
    return 1;
  }

  const profileResult = buildProfile(snapshot);
  const values = prefill(profileResult);
  const { markdown, open, skipped, bytes } = assemble({ profileResult, values });

  const brief = [
    '# Generation brief',
    '',
    `${open.length} placeholders need an answer. Each answer must cite a file,`,
    'in the form `NAME: value` followed by `  evidence: path:line`.',
    '',
    ...open.map((item) => `- \`${item.name}\`  (section: ${item.section})`),
    '',
    '## Sections skipped, and why',
    '',
    ...skipped.map((item) => `- ${item.title}: ${item.reason}`),
    '',
  ].join('\n');

  await writeFile(join(root, 'AGENTS.draft.md'), markdown, 'utf8');
  await writeFile(join(root, 'AGENTS.brief.md'), brief, 'utf8');

  line(`${symbol.ok} ${bold('AGENTS.draft.md')} ${dim(`${kb(bytes)}, ~${Math.round(bytes / 4 / 100) / 10}k tokens`)}`);
  line(`  ${dim(`${Object.keys(values).length} fields pre-filled, ${open.length} need an answer, ${skipped.length} sections skipped`)}`);

  const existing = await readIfPresent(join(root, 'AGENTS.md'));
  if (existing) {
    const diff = compare(existing, markdown);
    line();
    line(`  ${dim('against your existing AGENTS.md:')}`);
    line(`    ${diff.added.length} sections added, ${diff.removed.length} removed, ${diff.kept} kept`);
    for (const heading of diff.removed) line(`    ${symbol.warn} would lose: ${heading}`);
    line(`  ${dim('your AGENTS.md was not modified')}`);
  }
  return 0;
}
```

- [ ] **Step 4: Wire into the CLI**

In `src/cli.mjs`, add to the imports (keeping them sorted):

```javascript
import { context as contextCommand } from './commands/context.mjs';
import { profile as profileCommand } from './commands/profile.mjs';
```

Add to `USAGE` under COMMANDS:

```
  profile                   show what this project looks like, and the evidence
  context                   plan an AGENTS.md, writing a draft and a brief
```

Add to the switch, before `default`:

```javascript
    case 'profile':
      return profileCommand({ root });
    case 'context':
      return contextCommand({ root, plan: true });
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `node --test test/context/commands.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 6: Run everything**

Run: `npm run check`
Expected: PASS, all tests and all skills

- [ ] **Step 7: Commit**

```bash
git add src/commands/context.mjs src/commands/profile.mjs src/cli.mjs test/context/commands.test.mjs
git commit -m "feat: agentic profile and agentic context"
```

---

### Task 10: Teach `audit` to drive generation

**Files:**
- Modify: `skills/audit/SKILL.md`
- Test: `npm run validate`

**Interfaces:**
- Consumes: `agentic profile` and `agentic context` from Task 9
- Produces: no code interface. The skill body changes only.

- [ ] **Step 1: Replace the Execution section of `skills/audit/SKILL.md`**

```markdown
## Execution

1. Run `agentic context` if the command exists. It profiles the repository,
   selects the sections this project needs, pre-fills every fact the repo
   already states, and writes `AGENTS.draft.md` plus `AGENTS.brief.md`.
   If the command is missing, do the same work by hand and say so in the report.
2. Read `AGENTS.brief.md`. It lists every placeholder that still needs an
   answer and names the section each belongs to.
3. Answer each one from evidence. Every answer carries a citation:

   ```
   PRODUCT_SUMMARY: a content management system for course material
     evidence: README.md:1-14
   ```

   A claim you cannot cite is written as `Unknown`, never guessed.
4. Run the project's build and test commands, and record whether they currently
   pass. A command written down that does not run is worse than no command,
   because every later skill will try it.
5. Write the answers back into the draft, then write `AGENTS.generated.md`.
   Never write `AGENTS.md` directly.
6. Show what changed against any existing `AGENTS.md`, including anything the
   generated version would lose.
7. In a monorepo, repeat per workspace. A single root file describing five
   packages describes none of them.
```

- [ ] **Step 2: Run the standard against it**

Run: `npm run validate`
Expected: PASS, 9 skills, no long dashes, under budget

- [ ] **Step 3: Confirm the skill still compiles and installs**

Run: `node --test test/install.test.mjs`
Expected: PASS, including "installing every authored skill in this repo succeeds"

- [ ] **Step 4: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "feat: audit drives context generation and cites every answer"
```

---

### Task 11: Opt in prompt first mode for `develop`

**Files:**
- Create: `skills/develop/prompt-template.md`
- Modify: `skills/develop/SKILL.md`
- Modify: `src/manifest.mjs` (add `promptFirst` to the default manifest)
- Test: `test/manifest.test.mjs` (extend), `npm run validate`

**Interfaces:**
- Consumes: `defaultManifest` from `src/manifest.mjs`
- Produces: `defaultManifest()` returns an object including `promptFirst: false`.

- [ ] **Step 1: Write the failing test**

```javascript
// append to test/manifest.test.mjs
test('a default manifest has prompt first mode off', () => {
  assert.equal(defaultManifest({ targets: ['claude-code'] }).promptFirst, false);
});

test('prompt first survives a write and read', async () => {
  const root = await scratch();
  await writeManifest(root, { ...defaultManifest({ targets: ['claude-code'] }), promptFirst: true });
  assert.equal((await readManifest(root)).promptFirst, true);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test test/manifest.test.mjs`
Expected: FAIL, `undefined !== false`

- [ ] **Step 3: Add the field**

In `src/manifest.mjs`, change `defaultManifest`:

```javascript
export function defaultManifest({ targets = [DEFAULT_TARGET] } = {}) {
  return { standard: STANDARD_VERSION, targets, promptFirst: false, skills: {} };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test test/manifest.test.mjs`
Expected: PASS

- [ ] **Step 5: Write the prompt template**

```markdown
<!-- skills/develop/prompt-template.md -->
# Prompt: <what this change does, in one line>

**Request:** <the user's words, unedited>
**Spec:** <docs/specs/... or "none">
**Date:** <date>

## What I found

Every material finding, tagged by how it was obtained.

- `[O]` <something you ran, with the command and its output>
- `[D]` <something you read, with a file:line citation>
- `[A]` <something you inferred, and have not checked>

## What I will change

| File | Change |
|------|--------|
| <path> | <what and why> |

## Acceptance criteria

Every line names the test or the check that proves it. A criterion with no
proof attached is not a criterion, it is a hope.

- [ ] <observable behaviour> proved by `<command or test name>`

## What I will not do

<Anything deliberately out of this change, so nobody reports it as missing.>

## Open questions

<Only real ambiguity that repository evidence cannot resolve. Empty is a good
answer.>
```

- [ ] **Step 6: Add the mode to `skills/develop/SKILL.md`**

Insert after the "Step 0: the spec gate, always first" section:

```markdown
## Prompt first mode

Off by default. A one line change should not cost an approval round trip.

Turn it on for one request with a leading mode word, or for the project with
`"promptFirst": true` in `skills.json`:

- `/develop prompt <request>` runs this mode once.
- With the project setting on, a bare `/develop` runs this mode, and
  `/develop now <request>` skips it once.

If the first word is `prompt` and it is also a plausible feature name, do not
guess. Ask which was meant.

When the mode is on, before editing any file:

1. Read AGENTS.md, then the skills the user named, then the supporting skills
   the task clearly needs.
2. Inspect the relevant code, tests, config, types, schemas, and docs.
3. Tag every material finding `[O]`, `[D]`, or `[A]`.
4. Ask a focused question only where evidence cannot resolve real ambiguity.
5. Write `prompts/NNN-slug.md` from `prompt-template.md` in this skill's folder,
   numbering from the highest existing file plus one.
6. Give every acceptance criterion a test or an explicit verification step.
7. Ask: `I prepared the implementation prompt at prompts/NNN-slug.md. Is this
   good to execute?` Then stop and wait.
8. On approval, re-read the file and build strictly to it. On refusal, change
   nothing.

Do not weaken, delete, or skip a test to get a passing result. Do not claim
completion because an interface appears to work.
```

- [ ] **Step 7: Validate and test**

Run: `npm run check`
Expected: PASS. `develop` stays under the 12 KB budget and its bundled template passes the asset rules.

- [ ] **Step 8: Commit**

```bash
git add skills/develop src/manifest.mjs test/manifest.test.mjs
git commit -m "feat: opt in prompt first mode for develop"
```

---

### Task 12: Document both features

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: the commands from Task 9 and the mode from Task 11
- Produces: no code interface.

- [ ] **Step 1: Add the two commands to the README command table**

```markdown
| 🔎 | `agentic profile` | Show what this project looks like, and the evidence | 👁️ |
| 📄 | `agentic context` | Plan an AGENTS.md, writing a draft and a brief | ✍️ |
```

- [ ] **Step 2: Add a section after "Adding it to an existing project"**

```markdown
## 📄 Generating project context

Skills know how to work. `AGENTS.md` is how they learn about *your* project.

```bash
agentic profile      # what was detected, and the file that proved it
agentic context      # plan an AGENTS.md: draft plus a brief of what is missing
```

Sections are chosen from evidence, so a library gets 14 blocks and a pipeline
application gets 28. A section that does not apply is absent rather than filled
with `Unknown`.

Every fact the repository already states is pre-filled without a model
involved. Everything else is answered by `/audit` with a citation, and the
citation is re-read before the value is accepted. A value that cannot be
verified becomes `Unknown`.

Your `AGENTS.md` is never overwritten. The run writes `AGENTS.generated.md` and
shows what would change, including anything you would lose.
```

- [ ] **Step 3: Add prompt first mode to the develop entry in the skills section**

```markdown
```bash
/develop the transcript search page
/develop prompt add rate limiting to the login route   # write a prompt, wait for approval
```
```

- [ ] **Step 4: Add the new modules to the architecture module map**

```markdown
| `context/snapshot.mjs` | One bounded read of a repository |
| `context/profile.mjs` | Snapshot to signals, each with its evidence |
| `context/sections/*.mjs` | One file per section: its text and its predicate |
| `context/registry.mjs` | The section list, and selection against a profile |
| `context/prefill.mjs` | Every value the repository already states |
| `context/assemble.mjs` | Selected sections to one flat draft |
| `context/verify.mjs` | Re-read what the model claimed to have read |
| `context/compare.mjs` | What would change, at heading level |
```

- [ ] **Step 5: Add the repo rule to CLAUDE.md**

```markdown
- **A context section owns its text and its predicate in one file** under
  `src/context/sections/`, the same rule that applies to a standard family.
- **Generation never writes `AGENTS.md`.** It writes `AGENTS.generated.md` and
  a comparison.
```

- [ ] **Step 6: Verify the docs**

Run: `npm run check`
Expected: PASS

Check every internal link still resolves, and that no source references were introduced.

- [ ] **Step 7: Commit**

```bash
git add README.md CLAUDE.md docs/architecture.md
git commit -m "docs: context generation and prompt first mode"
```

---

## Self-review

**Spec coverage.** Every acceptance criterion in `docs/specs/0001-project-context-and-prompts.md` maps to a task:

| Spec criterion | Task |
|---|---|
| Empty profile selects exactly the 14 always blocks | 4 |
| Full profile selects all 28 | 4 |
| Every signal reports the file that produced it | 2 |
| `AGENTS.md` is one file, no companion directory | 6 |
| Every generation reports size and token estimate | 9 |
| Versions, commands, skills match manifests exactly | 5 |
| An unresolvable citation becomes `Unknown`, and is counted | 7 |
| `AGENTS.md` is never modified, a comparison is printed | 8, 9 |
| Running twice is byte identical | 6, 9 |
| Too little evidence produces an always blocks only file | 4, 6 |
| `/develop prompt` writes a prompt file and stops | 11 |
| A bare `/develop` does not pause | 11 |
| `promptFirst` in `skills.json` flips the default | 11 |
| Every prompt criterion names a test | 11 |
| Declining leaves the tree unchanged | 11 |
| Generated section 2 adapts to installed skills | 4 (`workflow.mjs` predicate reads `workflowSkills`) |

**One interface decision worth restating.** `text(signals)` takes the profile rather than being a constant, purely so `workflow.mjs` can branch: it names `/scope`, `/architect`, `/develop`, and `/check` when `workflowSkills.present`, and emits the self contained 18 step flow when not. Every other section ignores the argument. That single need is why the signature is not `text()`.

**Type consistency.** `signals` is the same shape in Tasks 2, 3, 4, 5, and 6. `profileResult` is always `{signals}`. `values` is always `Record<string,string>`. `verifyAnswers` returns `{accepted, downgraded}` and is consumed only by the audit skill, not by other modules.
