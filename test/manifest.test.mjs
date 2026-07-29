import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MANIFEST_FILE,
  defaultManifest,
  readManifest,
  removeSkill,
  setSkill,
  writeManifest,
} from '../src/manifest.mjs';
import { LOCK_FILE, integrity, readLock, writeLock } from '../src/lock.mjs';

const scratch = () => mkdtemp(join(tmpdir(), 'agentic-manifest-'));

test('a default manifest declares targets, a standard version, and no skills', () => {
  const manifest = defaultManifest({ targets: ['claude-code'] });
  assert.deepEqual(manifest.targets, ['claude-code']);
  assert.match(manifest.standard, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.skills, {});
});

test('a default manifest has prompt first mode off', () => {
  assert.equal(defaultManifest({ targets: ['claude-code'] }).promptFirst, false);
});

test('prompt first survives a write and read', async () => {
  const root = await scratch();
  await writeManifest(root, { ...defaultManifest({ targets: ['claude-code'] }), promptFirst: true });
  assert.equal((await readManifest(root)).promptFirst, true);
});

test('readManifest returns null when there is no manifest', async () => {
  assert.equal(await readManifest(await scratch()), null);
});

test('a written manifest reads back identically', async () => {
  const root = await scratch();
  const manifest = setSkill(defaultManifest({ targets: ['claude-code'] }), 'build', 'eric/x#v1');
  await writeManifest(root, manifest);
  assert.deepEqual(await readManifest(root), manifest);
});

test('a written manifest is human editable json with a trailing newline', async () => {
  const root = await scratch();
  await writeManifest(root, defaultManifest({ targets: ['claude-code'] }));
  const raw = await readFile(join(root, MANIFEST_FILE), 'utf8');
  assert.match(raw, /\n$/);
  assert.match(raw, /\n {2}"targets"/);
});

test('setSkill adds and then overwrites a skill', () => {
  let manifest = defaultManifest({ targets: ['claude-code'] });
  manifest = setSkill(manifest, 'build', 'eric/x#v1');
  assert.equal(manifest.skills.build, 'eric/x#v1');
  manifest = setSkill(manifest, 'build', 'eric/x#v2');
  assert.equal(manifest.skills.build, 'eric/x#v2');
  assert.equal(Object.keys(manifest.skills).length, 1);
});

test('setSkill does not mutate its input', () => {
  const before = defaultManifest({ targets: ['claude-code'] });
  setSkill(before, 'build', 'eric/x#v1');
  assert.deepEqual(before.skills, {});
});

test('skills are kept in sorted order so diffs stay small', () => {
  let manifest = defaultManifest({ targets: ['claude-code'] });
  for (const name of ['verify', 'build', 'audit']) manifest = setSkill(manifest, name, 'eric/x#v1');
  assert.deepEqual(Object.keys(manifest.skills), ['audit', 'build', 'verify']);
});

test('removeSkill drops one entry and leaves the rest', () => {
  let manifest = defaultManifest({ targets: ['claude-code'] });
  manifest = setSkill(manifest, 'build', 'eric/x#v1');
  manifest = setSkill(manifest, 'verify', 'eric/x#v1');
  manifest = removeSkill(manifest, 'build');
  assert.deepEqual(Object.keys(manifest.skills), ['verify']);
});

test('readManifest reports a corrupt manifest by path', async () => {
  const root = await scratch();
  await writeFile(join(root, MANIFEST_FILE), '{ not json');
  await assert.rejects(() => readManifest(root), /skills\.json/);
});

test('integrity is a stable sha256 that changes with content', () => {
  assert.equal(integrity('hello'), integrity('hello'));
  assert.notEqual(integrity('hello'), integrity('hello '));
  assert.match(integrity('hello'), /^sha256-[A-Za-z0-9+/]+=*$/);
});

test('a written lock reads back identically', async () => {
  const root = await scratch();
  const lock = {
    build: {
      resolved: 'github:eric/x',
      sha: 'a'.repeat(40),
      standard: '1.0.0',
      files: { '.claude/skills/build/SKILL.md': integrity('x') },
    },
  };
  await writeLock(root, lock);
  assert.deepEqual(await readLock(root), lock);
});

test('readLock returns an empty object when there is no lockfile', async () => {
  assert.deepEqual(await readLock(await scratch()), {});
});

test('the lockfile is written with a trailing newline', async () => {
  const root = await scratch();
  await writeLock(root, {});
  assert.match(await readFile(join(root, LOCK_FILE), 'utf8'), /\n$/);
});
