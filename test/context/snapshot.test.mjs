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

test('keeps .github so CI config can be read as evidence', async () => {
  const root = await repo({ '.github/workflows/ci.yml': 'name: check\n' });
  const snap = await takeSnapshot(root);
  assert.ok(snap.paths.includes('.github/workflows/ci.yml'));
  assert.equal(snap.files['.github/workflows/ci.yml'], 'name: check\n');
});
