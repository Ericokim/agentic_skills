// End to end: the pipeline against a real filesystem.
//
// Everything else in this suite is pure and runs without touching disk. These
// tests exist because the seams between the pure core and the world (writing
// files, detecting drift, refusing to clobber) are exactly where the pure tests
// cannot reach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { add } from '../src/commands/add.mjs';
import { commitInstall, detectDrift, discoverSkills, locateSkill, prepareInstall } from '../src/install.mjs';
import { readLock, writeLock } from '../src/lock.mjs';
import { defaultManifest, writeManifest } from '../src/manifest.mjs';

const GOOD = `---
name: build
description: Builds a feature from its spec.
allowed-tools: Read, Write, Bash, Agent
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: independent
  done: checklist
---

## What this skill does

Builds the thing.
`;

const INCOHERENT = GOOD.replace('evidence: strict', 'evidence: off');

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  await writeManifest(root, defaultManifest({ targets: ['claude-code'] }));
  return root;
}

async function sourceSkill(name, contents) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), contents, 'utf8');
  return skillDir;
}

/** A source directory holding several skills, laid out at its top level. */
async function multiSkillSource(names) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  for (const name of names) {
    const skillDir = join(dir, name);
    await mkdir(skillDir, { recursive: true });
    // The standard requires a skill's frontmatter name to match its
    // directory, so each one needs its own copy of GOOD rather than sharing
    // "build" across every directory.
    await writeFile(join(skillDir, 'SKILL.md'), GOOD.replace('name: build', `name: ${name}`), 'utf8');
  }
  return dir;
}

/** Run a function while capturing everything it writes to stdout. */
async function captureOutput(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let output = '';
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    const result = await fn();
    return { result, output };
  } finally {
    process.stdout.write = original;
  }
}

const install = (root, spec) =>
  prepareInstall({ root, name: null, spec, targets: ['claude-code'], cwd: root });

test('installs a compiled skill with the standard injected', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const prepared = await install(root, spec);
  assert.deepEqual(prepared.violations, []);
  await commitInstall({ root, ...prepared });

  const installed = await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');
  assert.match(installed, /## Evidence classification/);
  assert.match(installed, /## Definition of done/);
  assert.doesNotMatch(installed.split('---')[1], /standard:/);
});

test('a skill that fails the standard plans no files at all', async () => {
  const root = await project();
  const spec = await sourceSkill('build', INCOHERENT);

  const prepared = await install(root, spec);
  assert.ok(prepared.violations.some((v) => v.severity === 'error'));
  assert.deepEqual(prepared.files, []);
  assert.equal(prepared.compiled, null);

  // Nothing was written, so the project is untouched.
  assert.deepEqual(await readdir(root), ['skills.json']);
});

test('detects a hand edited installed file', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await install(root, spec);
  const { entry } = await commitInstall({ root, ...prepared });

  assert.deepEqual(await detectDrift(root, entry), []);

  const path = join(root, '.claude/skills/build/SKILL.md');
  await writeFile(path, `${await readFile(path, 'utf8')}\nedited by a person\n`, 'utf8');

  const drift = await detectDrift(root, entry);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].reason, 'edited');
});

test('detects a deleted installed file', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await install(root, spec);
  const { entry } = await commitInstall({ root, ...prepared });

  await writeLock(root, { build: entry });
  entry.files['.claude/skills/build/GONE.md'] = 'sha256-whatever';

  const drift = await detectDrift(root, entry);
  assert.ok(drift.some((d) => d.reason === 'missing'));
});

test('the lock entry records the source, standard, and a hash per file', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await install(root, spec);
  const { entry } = await commitInstall({ root, ...prepared });
  await writeLock(root, { build: entry });

  const lock = await readLock(root);
  assert.equal(lock.build.standard, '1.0.0');
  assert.match(lock.build.resolved, /build$/);
  assert.deepEqual(Object.keys(lock.build.files), ['.claude/skills/build/SKILL.md']);
  assert.match(lock.build.files['.claude/skills/build/SKILL.md'], /^sha256-/);
});

test('installing to several targets writes each one', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await prepareInstall({
    root,
    name: null,
    spec,
    targets: ['claude-code', 'codex', 'cursor'],
    cwd: root,
  });
  await commitInstall({ root, ...prepared });

  for (const relative of [
    '.claude/skills/build/SKILL.md',
    '.agents/skills/build/SKILL.md',
    '.agents/skills/build/agents/openai.yaml',
    '.cursor/rules/build.mdc',
  ]) {
    await readFile(join(root, relative), 'utf8');
  }
});

test('locateSkill names what a source actually contains when the skill is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  await mkdir(join(dir, 'skills', 'audit'), { recursive: true });
  await writeFile(join(dir, 'skills', 'audit', 'SKILL.md'), GOOD, 'utf8');

  await assert.rejects(
    () => locateSkill(dir, 'nope'),
    (error) => {
      assert.match(error.message, /nope/);
      assert.match(error.message, /audit/);
      return true;
    },
  );
});

test('installing every authored skill in this repo succeeds', async () => {
  const root = await project();
  const repo = new URL('..', import.meta.url).pathname;

  const entries = await readdir(join(repo, 'skills'), { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.equal(names.length, 9, 'expected the nine workflow skills');

  for (const name of names) {
    const prepared = await install(root, join(repo, 'skills', name));
    assert.deepEqual(
      prepared.violations.filter((v) => v.severity === 'error'),
      [],
      `${name} failed the standard`,
    );
    await commitInstall({ root, ...prepared });
    const installed = await readFile(join(root, `.claude/skills/${name}/SKILL.md`), 'utf8');
    assert.match(installed, /## Definition of done/, `${name} lost its definition of done`);
  }
});

test('selecting two targets that share a path plans that file once', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const prepared = await prepareInstall({
    root,
    name: null,
    spec,
    targets: ['codex', 'generic'], // both write .agents/skills/build/SKILL.md
    cwd: root,
  });

  const paths = prepared.files.map((f) => f.path);
  assert.deepEqual(paths, [...new Set(paths)], `duplicate planned paths: ${paths.join(', ')}`);
  assert.equal(paths.filter((p) => p.endsWith('.agents/skills/build/SKILL.md')).length, 1);
  assert.ok(paths.some((p) => p.endsWith('agents/openai.yaml')), 'codex adapter should survive');
});

test('discoverSkills finds many skills nested under skills/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  await mkdir(join(dir, 'skills', 'audit'), { recursive: true });
  await mkdir(join(dir, 'skills', 'build'), { recursive: true });
  await writeFile(join(dir, 'skills', 'audit', 'SKILL.md'), GOOD, 'utf8');
  await writeFile(join(dir, 'skills', 'build', 'SKILL.md'), GOOD, 'utf8');

  const found = await discoverSkills(dir);
  assert.deepEqual(found.map((s) => s.name), ['audit', 'build']);
  assert.equal(found[0].path, join(dir, 'skills', 'audit'));
  assert.equal(found[1].path, join(dir, 'skills', 'build'));
});

test('discoverSkills finds many skills at the top level', async () => {
  const dir = await multiSkillSource(['zebra', 'audit', 'build']);

  const found = await discoverSkills(dir);
  assert.deepEqual(found.map((s) => s.name), ['audit', 'build', 'zebra']);
  assert.equal(found[0].path, join(dir, 'audit'));
});

test('discoverSkills returns nothing for a source with exactly one skill at its root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  await writeFile(join(dir, 'SKILL.md'), GOOD, 'utf8');

  assert.deepEqual(await discoverSkills(dir), []);
});

test('discoverSkills returns nothing for a source with no skills at all', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));

  assert.deepEqual(await discoverSkills(dir), []);
});

test('add installs every skill from a multi-skill source when no name is given', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  assert.match(output, /Found 3 skills/);
  assert.match(output, /3 skills installed, 0 failed/);

  for (const name of ['alpha', 'beta', 'gamma']) {
    await readFile(join(root, `.claude/skills/${name}/SKILL.md`), 'utf8');
  }

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills).sort(), ['alpha', 'beta', 'gamma']);
});

test('add --only installs just the requested subset of a multi-skill source', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const code = await add({
    root,
    spec: src,
    name: null,
    only: 'alpha,gamma',
    targets: ['claude-code'],
    cacheDir: tmpdir(),
    dryRun: false,
    force: false,
    cwd: root,
  });

  assert.equal(code, 0);
  await readFile(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8');
  await readFile(join(root, '.claude/skills/gamma/SKILL.md'), 'utf8');
  await assert.rejects(() => readFile(join(root, '.claude/skills/beta/SKILL.md'), 'utf8'));

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills).sort(), ['alpha', 'gamma']);
});

test('add --only with an unknown name errors and names what the source does provide', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: 'nope',
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 1);
  assert.match(output, /nope/);
  assert.match(output, /alpha/);
  assert.match(output, /beta/);
  assert.match(output, /gamma/);

  // Nothing was written: an unknown --only name refuses the whole install.
  assert.deepEqual(await readdir(root), ['skills.json']);
});

test('add still installs a single-skill source exactly as before', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  assert.doesNotMatch(output, /Found \d+ skills/);
  await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');
});

test('installing a multi-skill source never touches an existing AGENTS.md', async () => {
  const root = await project();
  const agentsContents = '# Custom agent instructions\n\nDo not touch this file.\n';
  await writeFile(join(root, 'AGENTS.md'), agentsContents, 'utf8');

  const src = await multiSkillSource(['alpha', 'beta']);
  await add({
    root,
    spec: src,
    name: null,
    only: null,
    targets: ['claude-code', 'codex'],
    cacheDir: tmpdir(),
    dryRun: false,
    force: false,
    cwd: root,
  });

  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), agentsContents);
});
