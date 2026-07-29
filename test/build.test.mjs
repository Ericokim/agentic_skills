// The publish time compile step, end to end against a real filesystem: read
// skills-src/, refuse on a failing source, compile, and write skills/ - or,
// with check, compare without writing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from '../src/commands/build.mjs';
import { isCompiled } from '../src/validate.mjs';
import { captureOutput } from './.capture-output.mjs';

const good = (name) => `---
name: ${name}
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

const incoherent = (name) => good(name).replace('evidence: strict', 'evidence: off');

async function project() {
  return mkdtemp(join(tmpdir(), 'agentic-build-'));
}

async function writeSource(root, name, contents, assets = {}) {
  const dir = join(root, 'skills-src', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), contents, 'utf8');
  for (const [relPath, body] of Object.entries(assets)) {
    await writeFile(join(dir, relPath), body, 'utf8');
  }
}

test('build compiles a source tree, injecting the declared blocks and stripping standard:', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));

  const { result: code } = await captureOutput(() => build({ root }));
  assert.equal(code, 0);

  const out = await readFile(join(root, 'skills', 'build', 'SKILL.md'), 'utf8');
  assert.equal(isCompiled(out), true);
  assert.match(out, /## Evidence classification/);
  assert.match(out, /## Definition of done/);
  assert.doesNotMatch(out.split('---')[1], /standard:/);
});

test('build copies bundled files across unchanged', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'), {
    'template.md': '# a template\n\nSome words.\n',
  });

  await captureOutput(() => build({ root }));

  const asset = await readFile(join(root, 'skills', 'build', 'template.md'), 'utf8');
  assert.equal(asset, '# a template\n\nSome words.\n');
});

test('building twice is byte identical', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));

  await captureOutput(() => build({ root }));
  const first = await readFile(join(root, 'skills', 'build', 'SKILL.md'), 'utf8');

  await captureOutput(() => build({ root }));
  const second = await readFile(join(root, 'skills', 'build', 'SKILL.md'), 'utf8');

  assert.equal(first, second);
});

test('build refuses when a source fails the standard, exits non zero, and writes nothing', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));
  await captureOutput(() => build({ root }));
  const before = await readFile(join(root, 'skills', 'build', 'SKILL.md'), 'utf8');

  await writeSource(root, 'build', incoherent('build')); // break the only source
  const { result: code, output } = await captureOutput(() => build({ root }));
  assert.equal(code, 1);
  assert.match(output, /nothing was built/);

  const after = await readFile(join(root, 'skills', 'build', 'SKILL.md'), 'utf8');
  assert.equal(after, before, 'a refused build must not touch what was already there');
});

test('one failing source blocks the whole build, not just itself', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));
  await writeSource(root, 'audit', incoherent('audit'));

  const { result: code } = await captureOutput(() => build({ root }));
  assert.equal(code, 1);
  await assert.rejects(() => readdir(join(root, 'skills')));
});

test('build --check exits 0 when the compiled output matches what is committed', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));
  await captureOutput(() => build({ root }));

  const { result: code } = await captureOutput(() => build({ root, check: true }));
  assert.equal(code, 0);
});

test('build --check writes nothing', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));

  const { result: code } = await captureOutput(() => build({ root, check: true }));
  assert.equal(code, 1); // nothing built yet, so skills/ is entirely missing
  await assert.rejects(() => readdir(join(root, 'skills')));
});

test('build --check exits 1 and names the differing file when a source is edited without rebuilding', async () => {
  const root = await project();
  await writeSource(root, 'build', good('build'));
  await captureOutput(() => build({ root }));

  await writeSource(root, 'build', good('build').replace('Builds the thing.', 'Builds a different thing.'));

  const { result: staleCode, output: staleOutput } = await captureOutput(() => build({ root, check: true }));
  assert.equal(staleCode, 1);
  assert.match(staleOutput, /build\/SKILL\.md/);
  assert.match(staleOutput, /stale/);

  await captureOutput(() => build({ root })); // rebuild
  const { result: freshCode } = await captureOutput(() => build({ root, check: true }));
  assert.equal(freshCode, 0);
});
