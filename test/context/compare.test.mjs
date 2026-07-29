import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compare } from '../../src/context/compare.mjs';

test('reports headings only the generated file has', () => {
  const out = compare('# 1. Product\n', '# 1. Product\n\n# 6. Tech stack\n');
  assert.deepEqual(out.added, ['6. Tech stack']);
  assert.deepEqual(out.removed, []);
  assert.equal(out.kept, 1);
});

test('reports headings only the existing file has', () => {
  const out = compare('# 1. Product\n\n# 9. Custom rules\n', '# 1. Product\n');
  assert.deepEqual(out.removed, ['9. Custom rules']);
});

test('an empty existing file makes everything added', () => {
  const out = compare('', '# 1. Product\n');
  assert.deepEqual(out.added, ['1. Product']);
  assert.equal(out.kept, 0);
});

test('identical files report no change', () => {
  const same = '# 1. Product\n\n# 6. Tech stack\n';
  const out = compare(same, same);
  assert.deepEqual(out.added, []);
  assert.deepEqual(out.removed, []);
  assert.equal(out.kept, 2);
});
