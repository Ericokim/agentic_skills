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
