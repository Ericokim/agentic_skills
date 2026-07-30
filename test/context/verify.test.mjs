// test/context/verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAnswers, verifyAnswers } from '../../src/context/verify.mjs';

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

// The brief this feature prints tells the reader, in these words: "Each answer
// must cite a file, in the form `NAME: value` followed by `  evidence:
// path:line`." Following that instruction produced
// "answers.txt is not valid JSON", because --answers only ever ran JSON.parse.
// The two halves of one feature disagreed about the format, and the half a user
// reads lost.

test('parseAnswers reads the form the brief documents', () => {
  const parsed = parseAnswers(
    'PROJECT_NAME: demo\n  evidence: package.json:1\nPRODUCT_SUMMARY: An API.\n  evidence: README.md:3-9\n',
  );
  assert.deepEqual(parsed, {
    PROJECT_NAME: { value: 'demo', evidence: ['package.json:1'] },
    PRODUCT_SUMMARY: { value: 'An API.', evidence: ['README.md:3-9'] },
  });
});

test('parseAnswers takes several citations for one answer', () => {
  const parsed = parseAnswers(
    'COMMANDS: npm test\n  evidence: package.json:8\n  evidence: .github/workflows/ci.yml:12\n',
  );
  assert.deepEqual(parsed.COMMANDS.evidence, ['package.json:8', '.github/workflows/ci.yml:12']);
});

test('parseAnswers keeps an answer that cites nothing, so verify can downgrade it', () => {
  const parsed = parseAnswers('PROJECT_NAME: demo\n');
  assert.deepEqual(parsed, { PROJECT_NAME: { value: 'demo', evidence: [] } });
});

test('parseAnswers still accepts JSON, which is what it used to require', () => {
  const json = JSON.stringify({ PROJECT_NAME: { value: 'demo', evidence: ['package.json:1'] } });
  assert.deepEqual(parseAnswers(json), {
    PROJECT_NAME: { value: 'demo', evidence: ['package.json:1'] },
  });
});

test('parseAnswers ignores blank lines and comments', () => {
  const parsed = parseAnswers('# my answers\n\nPROJECT_NAME: demo\n  evidence: package.json:1\n\n');
  assert.deepEqual(Object.keys(parsed), ['PROJECT_NAME']);
});

test('parseAnswers reports a file that is neither form rather than guessing', () => {
  assert.throws(() => parseAnswers('this is just prose with no colon'), /NAME: value/);
});

test('a value containing a colon survives, because URLs and times have them', () => {
  const parsed = parseAnswers('DOCS_URL: https://example.com:8080/docs\n  evidence: README.md:2\n');
  assert.equal(parsed.DOCS_URL.value, 'https://example.com:8080/docs');
});

test('an evidence line before any answer is an error, not an answer named evidence', () => {
  // Without this it fell through to the NAME: value branch and invented a
  // placeholder called "evidence", which then failed verification for a reason
  // that pointed nowhere near the actual mistake.
  assert.throws(
    () => parseAnswers('  evidence: package.json:1\nPROJECT_NAME: demo\n'),
    /belongs under an answer/,
  );
});

test('an unindented evidence line is still an error rather than a silent answer', () => {
  assert.throws(() => parseAnswers('evidence: package.json:1\n'), /belongs under an answer/);
});
