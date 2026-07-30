// The publish time compile step, end to end against a real filesystem: read
// skills/, refuse on a failing skill, and regenerate the standard blocks in
// place - or, with check, report what would change without writing.
//
// The build reads and writes the same tree, so half of what these tests are for
// is proving it never damages its own input: a refused build, and a --check,
// must both leave every byte where it was.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from '../src/commands/build.mjs';
import { declaresStandard } from '../src/validate.mjs';
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

async function writeSkill(root, name, contents, assets = {}) {
  const dir = join(root, 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), contents, 'utf8');
  for (const [relPath, body] of Object.entries(assets)) {
    await writeFile(join(dir, relPath), body, 'utf8');
  }
}

const read = (root, name, file = 'SKILL.md') =>
  readFile(join(root, 'skills', name, file), 'utf8');

test('build injects the declared blocks in place and keeps the declaration', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));

  const { result: code } = await captureOutput(() => build({ root }));
  assert.equal(code, 0);

  const out = await read(root, 'build');
  assert.match(out, /## Evidence classification/);
  assert.match(out, /## Definition of done/);
  assert.equal(declaresStandard(out), true, 'the declaration is what the next build reads');
  assert.match(out, /Builds the thing\./, 'the authored prose survives');
});

test('build leaves bundled files untouched', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'), {
    'template.md': '# a template\n\nSome words.\n',
  });

  await captureOutput(() => build({ root }));

  assert.equal(await read(root, 'build', 'template.md'), '# a template\n\nSome words.\n');
});

test('building twice is byte identical', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));

  await captureOutput(() => build({ root }));
  const first = await read(root, 'build');

  const { output } = await captureOutput(() => build({ root }));
  const second = await read(root, 'build');

  assert.equal(first, second);
  assert.match(output, /already current/, 'a no op build says so rather than claiming work');
});

test('build refuses when a skill fails the standard, exits non zero, and writes nothing', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));
  await captureOutput(() => build({ root }));
  const before = await read(root, 'build');

  // Break the declaration of the only skill, keeping the injected blocks.
  await writeFile(join(root, 'skills', 'build', 'SKILL.md'), before.replace('evidence: strict', 'evidence: off'), 'utf8');
  const broken = await read(root, 'build');

  const { result: code, output } = await captureOutput(() => build({ root }));
  assert.equal(code, 1);
  assert.match(output, /nothing was built/);
  assert.equal(await read(root, 'build'), broken, 'a refused build must not touch what it read');
});

test('one failing skill blocks the whole build, leaving the passing one uncompiled', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));
  await writeSkill(root, 'audit', incoherent('audit'));

  const { result: code } = await captureOutput(() => build({ root }));
  assert.equal(code, 1);

  const untouched = await read(root, 'build');
  assert.equal(untouched, good('build'), 'a blocked build compiles nothing, not eight of nine');
  assert.doesNotMatch(untouched, /## Evidence classification/);
});

test('build reports when there are no skills to build', async () => {
  const root = await project();
  const { result: code, output } = await captureOutput(() => build({ root }));
  assert.equal(code, 1);
  assert.match(output, /no skills found/);
});

test('build --check exits 0 once the blocks are current', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));
  await captureOutput(() => build({ root }));

  const { result: code } = await captureOutput(() => build({ root, check: true }));
  assert.equal(code, 0);
});

test('build --check writes nothing', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));

  const { result: code } = await captureOutput(() => build({ root, check: true }));
  assert.equal(code, 1); // never built, so the blocks are missing
  assert.equal(await read(root, 'build'), good('build'), '--check must not write');
});

test('build --check exits 1 and names the file when a declaration changes without a rebuild', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));
  await captureOutput(() => build({ root }));

  const current = await read(root, 'build');
  await writeFile(
    join(root, 'skills', 'build', 'SKILL.md'),
    current.replace('tdd: red-green\n', 'tdd: red-green-refactor\n'),
    'utf8',
  );

  const { result: staleCode, output: staleOutput } = await captureOutput(() =>
    build({ root, check: true }),
  );
  assert.equal(staleCode, 1);
  assert.match(staleOutput, /build\/SKILL\.md/);
  assert.match(staleOutput, /stale/);

  await captureOutput(() => build({ root })); // rebuild
  const { result: freshCode } = await captureOutput(() => build({ root, check: true }));
  assert.equal(freshCode, 0);
});

test('build --check catches a hand edit inside a generated block', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));
  await captureOutput(() => build({ root }));

  const current = await read(root, 'build');
  await writeFile(
    join(root, 'skills', 'build', 'SKILL.md'),
    current.replace('## Definition of done', '## Definition of nearly done'),
    'utf8',
  );

  const { result: code, output } = await captureOutput(() => build({ root, check: true }));
  assert.equal(code, 1, 'a generated region is not a place to edit by hand');
  assert.match(output, /stale/);
});

test('a rebuild restores a hand edited block rather than stacking a second copy', async () => {
  const root = await project();
  await writeSkill(root, 'build', good('build'));
  await captureOutput(() => build({ root }));
  const current = await read(root, 'build');

  await writeFile(
    join(root, 'skills', 'build', 'SKILL.md'),
    current.replace('## Evidence classification', '## Evidence, sort of'),
    'utf8',
  );
  await captureOutput(() => build({ root }));

  const rebuilt = await read(root, 'build');
  assert.equal(rebuilt, current, 'the region is regenerated, not appended to');
  assert.equal(rebuilt.match(/## Definition of done/g).length, 1);
  assert.equal(rebuilt.match(/agentic:standard/g).length, 4, 'two regions, open and close each');
});
