import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { resolveRoots } from '../src/scope.mjs';

test('project scope resolves both roots to the project root', () => {
  const { installRoot, manifestRoot } = resolveRoots({
    scope: 'project',
    projectRoot: '/work/app',
    home: '/Users/x',
  });
  assert.equal(installRoot, '/work/app');
  assert.equal(manifestRoot, '/work/app');
});

test('global scope resolves installRoot to the injected home', () => {
  const { installRoot } = resolveRoots({ scope: 'global', projectRoot: '/work/app', home: '/Users/x' });
  assert.equal(installRoot, '/Users/x');
});

test('global scope resolves manifestRoot to <home>/.agentic', () => {
  const { manifestRoot } = resolveRoots({ scope: 'global', projectRoot: '/work/app', home: '/Users/x' });
  assert.equal(manifestRoot, join('/Users/x', '.agentic'));
});

test('global scope never mixes in the project root', () => {
  const { installRoot, manifestRoot } = resolveRoots({
    scope: 'global',
    projectRoot: '/work/app',
    home: '/Users/x',
  });
  assert.doesNotMatch(installRoot, /\/work\/app/);
  assert.doesNotMatch(manifestRoot, /\/work\/app/);
});

test('home defaults to os.homedir() when not supplied', () => {
  const { installRoot } = resolveRoots({ scope: 'global', projectRoot: '/work/app' });
  assert.equal(typeof installRoot, 'string');
  assert.ok(installRoot.length > 0);
});
