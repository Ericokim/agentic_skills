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
