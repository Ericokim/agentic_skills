import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { context as contextCommand } from '../../src/commands/context.mjs';
import { profile as profileCommand } from '../../src/commands/profile.mjs';
import { captureOutput } from '../.capture-output.mjs';

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'agentic-cmd-'));
  await writeFile(join(root, 'package.json'), '{"scripts":{"test":"node --test"}}', 'utf8');
  return root;
}

test('profile exits 0 on a readable repository', async () => {
  const { result: code } = await captureOutput(async () => profileCommand({ root: await repo() }));
  assert.equal(code, 0);
});

test('context writes a draft and a brief', async () => {
  const root = await repo();
  const { result: code } = await captureOutput(() => contextCommand({ root, plan: true }));
  assert.equal(code, 0);
  const draft = await readFile(join(root, 'AGENTS.draft.md'), 'utf8');
  const brief = await readFile(join(root, 'AGENTS.brief.md'), 'utf8');
  assert.match(draft, /# 1\. Product/);
  assert.match(brief, /PRODUCT_SUMMARY/);
});

test('context never writes AGENTS.md', async () => {
  const root = await repo();
  await writeFile(join(root, 'AGENTS.md'), 'curated by a person\n', 'utf8');
  await captureOutput(() => contextCommand({ root, plan: true }));
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), 'curated by a person\n');
});

test('running twice produces an identical draft', async () => {
  const root = await repo();
  await captureOutput(() => contextCommand({ root, plan: true }));
  const first = await readFile(join(root, 'AGENTS.draft.md'), 'utf8');
  await captureOutput(() => contextCommand({ root, plan: true }));
  assert.equal(await readFile(join(root, 'AGENTS.draft.md'), 'utf8'), first);
});
