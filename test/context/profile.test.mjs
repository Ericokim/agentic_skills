import { test } from 'node:test';
import assert from 'node:assert/strict';

import { profile } from '../../src/context/profile.mjs';

const snap = (files, paths = []) => ({
  root: '/repo',
  paths: [...paths, ...Object.keys(files)],
  files,
});

test('every signal exists as a key even when absent', () => {
  const { signals } = profile(snap({}));
  for (const id of [
    'packageManager', 'languages', 'frameworks', 'database', 'httpRoutes',
    'backgroundWork', 'ui', 'browserTooling', 'secrets', 'tests', 'commands',
    'workflowSkills', 'librarySkills',
  ]) {
    assert.ok(id in signals, `${id} missing`);
    assert.equal(typeof signals[id].present, 'boolean');
    assert.ok(Array.isArray(signals[id].evidence));
  }
});

test('detects a database from a dependency', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"pg":"^8.0.0"}}' }));
  assert.equal(signals.database.present, true);
  assert.deepEqual(signals.database.evidence, ['package.json']);
});

test('detects a database from a migrations directory', () => {
  const { signals } = profile(snap({}, ['migrations/001_init.sql']));
  assert.equal(signals.database.present, true);
  assert.ok(signals.database.evidence.includes('migrations/001_init.sql'));
});

test('does not detect a database from nothing', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"lodash":"^4"}}' }));
  assert.equal(signals.database.present, false);
  assert.deepEqual(signals.database.evidence, []);
});

test('detects background work from a scheduler dependency', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"node-cron":"^3"}}' }));
  assert.equal(signals.backgroundWork.present, true);
});

test('detects browser tooling separately from a UI', () => {
  const { signals } = profile(snap({
    'package.json': '{"dependencies":{"react":"^19"},"devDependencies":{"@playwright/test":"^1"}}',
  }));
  assert.equal(signals.ui.present, true);
  assert.equal(signals.browserTooling.present, true);
});

test('reads commands from package scripts', () => {
  const { signals } = profile(snap({
    'package.json': '{"scripts":{"build":"tsc","test":"vitest run"}}',
  }));
  assert.equal(signals.commands.present, true);
  assert.deepEqual(signals.commands.detail, { build: 'tsc', test: 'vitest run' });
});

test('reads workflow skills from the lockfile', () => {
  const { signals } = profile(snap({
    'skills.lock': '{"develop":{"resolved":"x","sha":null,"standard":"1.0.0","files":{}}}',
  }));
  assert.equal(signals.workflowSkills.present, true);
  assert.deepEqual(signals.workflowSkills.detail, ['develop']);
});

test('malformed json does not throw, it reports absent', () => {
  const { signals } = profile(snap({ 'package.json': '{ not json' }));
  assert.equal(signals.database.present, false);
  assert.equal(signals.commands.present, false);
});

test('is pure: the same snapshot gives the same profile', () => {
  const s = snap({ 'package.json': '{"dependencies":{"pg":"^8"}}' });
  assert.deepEqual(profile(s), profile(s));
});
