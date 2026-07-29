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

async function writeAnswers(root, answers) {
  const path = join(root, 'answers.json');
  await writeFile(path, JSON.stringify(answers), 'utf8');
  return path;
}

test('an answer whose citation resolves is substituted into AGENTS.generated.md', async () => {
  const root = await repo();
  await writeFile(join(root, 'README.md'), 'a course catalogue for adult learners\n', 'utf8');
  const answers = await writeAnswers(root, {
    PRODUCT_SUMMARY: { value: 'a course catalogue', evidence: ['README.md:1'] },
  });

  const { result: code } = await captureOutput(() => contextCommand({ root, plan: true, answers }));
  assert.equal(code, 0);

  const generated = await readFile(join(root, 'AGENTS.generated.md'), 'utf8');
  assert.match(generated, /a course catalogue/);
  assert.doesNotMatch(generated, /\{\{PRODUCT_SUMMARY\}\}/);
});

test('an answer whose citation does not resolve becomes Unknown, is reported, and exits 1', async () => {
  const root = await repo();
  await writeFile(join(root, 'README.md'), 'a system for schools\n', 'utf8');
  const answers = await writeAnswers(root, {
    PRODUCT_SUMMARY: { value: 'a system for hospitals', evidence: ['README.md:1'] },
  });

  const { result: code, output } = await captureOutput(() => contextCommand({ root, plan: true, answers }));
  assert.equal(code, 1);

  const generated = await readFile(join(root, 'AGENTS.generated.md'), 'utf8');
  assert.match(generated, /Unknown/);
  assert.doesNotMatch(generated, /hospitals/);
  assert.match(output, /PRODUCT_SUMMARY/);
  assert.match(output, /downgraded/i);
});

test('an answer with no citation is downgraded the same way', async () => {
  const root = await repo();
  const answers = await writeAnswers(root, {
    PRODUCT_SUMMARY: { value: 'a course catalogue', evidence: [] },
  });

  const { result: code, output } = await captureOutput(() => contextCommand({ root, plan: true, answers }));
  assert.equal(code, 1);

  const generated = await readFile(join(root, 'AGENTS.generated.md'), 'utf8');
  assert.match(generated, /Unknown/);
  assert.match(output, /PRODUCT_SUMMARY/);
});

test('a prefilled fact is not overwritten by a conflicting answer', async () => {
  const root = await repo();
  await writeFile(join(root, 'package-lock.json'), '{}', 'utf8');
  await writeFile(join(root, 'README.md'), 'this project uses pnpm\n', 'utf8');
  const answers = await writeAnswers(root, {
    PACKAGE_MANAGER: { value: 'pnpm', evidence: ['README.md:1'] },
  });

  const { result: code, output } = await captureOutput(() => contextCommand({ root, plan: true, answers }));
  assert.equal(code, 0);

  const generated = await readFile(join(root, 'AGENTS.generated.md'), 'utf8');
  assert.match(generated, /Package manager: npm/);
  assert.doesNotMatch(generated, /Package manager: pnpm/);
  assert.match(output, /PACKAGE_MANAGER/);
});

test('AGENTS.md is never modified, even when it exists', async () => {
  const root = await repo();
  const curated = 'curated by a person\n';
  await writeFile(join(root, 'AGENTS.md'), curated, 'utf8');
  const answers = await writeAnswers(root, {
    PRODUCT_SUMMARY: { value: 'a course catalogue', evidence: [] },
  });

  await captureOutput(() => contextCommand({ root, plan: true, answers }));
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), curated);
});

test('running the same answers twice produces a byte-identical AGENTS.generated.md', async () => {
  const root = await repo();
  await writeFile(join(root, 'README.md'), 'a course catalogue\n', 'utf8');
  const answers = await writeAnswers(root, {
    PRODUCT_SUMMARY: { value: 'a course catalogue', evidence: ['README.md:1'] },
  });

  await captureOutput(() => contextCommand({ root, plan: true, answers }));
  const first = await readFile(join(root, 'AGENTS.generated.md'), 'utf8');
  await captureOutput(() => contextCommand({ root, plan: true, answers }));
  const second = await readFile(join(root, 'AGENTS.generated.md'), 'utf8');
  assert.equal(second, first);
});

test('a malformed answers file exits non-zero, names the file, and writes nothing', async () => {
  const root = await repo();
  const path = join(root, 'broken.json');
  await writeFile(path, '{not json', 'utf8');

  const { result: code, output } = await captureOutput(() => contextCommand({ root, plan: true, answers: path }));
  assert.notEqual(code, 0);
  assert.match(output, /broken\.json/);
  await assert.rejects(() => readFile(join(root, 'AGENTS.generated.md'), 'utf8'));
});
