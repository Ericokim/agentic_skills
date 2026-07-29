import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialState, reduce } from '../../src/ui/select-state.mjs';

const ITEMS = [
  { id: 'project', label: 'Project', hint: 'Install in current directory, committed with your project' },
  { id: 'global', label: 'Global', hint: 'Install in your home directory, available in every project' },
];

const KEY = {
  up: { name: 'up', sequence: '\x1b[A', ctrl: false },
  down: { name: 'down', sequence: '\x1b[B', ctrl: false },
  space: { name: 'space', sequence: ' ', ctrl: false },
  enter: { name: 'return', sequence: '\r', ctrl: false },
  escape: { name: 'escape', sequence: '\x1b', ctrl: false },
  ctrlC: { name: 'c', sequence: '\x03', ctrl: true },
};

test('initialState starts on the first item, nothing chosen yet', () => {
  const state = initialState(ITEMS);
  assert.equal(state.cursor, 0);
  assert.equal(state.chosen, null);
  assert.equal(state.done, false);
  assert.equal(state.cancelled, false);
});

test('down moves the cursor forward', () => {
  const state = reduce(initialState(ITEMS), KEY.down);
  assert.equal(state.cursor, 1);
});

test('up moves the cursor backward', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.up);
  assert.equal(state.cursor, 0);
});

test('down wraps from the last item to the first', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.down);
  assert.equal(state.cursor, 0);
});

test('up wraps from the first item to the last', () => {
  const state = reduce(initialState(ITEMS), KEY.up);
  assert.equal(state.cursor, ITEMS.length - 1);
});

test('enter chooses the item under the cursor', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down); // cursor -> global
  state = reduce(state, KEY.enter);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, false);
  assert.equal(state.chosen, 'global');
});

test('enter with the cursor on the first item chooses that one', () => {
  const state = reduce(initialState(ITEMS), KEY.enter);
  assert.equal(state.chosen, 'project');
});

test('escape cancels without choosing anything', () => {
  const state = reduce(initialState(ITEMS), KEY.escape);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, true);
  assert.equal(state.chosen, null);
});

test('ctrl+c cancels without choosing anything', () => {
  const state = reduce(initialState(ITEMS), KEY.ctrlC);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, true);
  assert.equal(state.chosen, null);
});

test('space does nothing', () => {
  const before = initialState(ITEMS);
  const after = reduce(before, KEY.space);
  assert.equal(after.cursor, before.cursor);
  assert.equal(after.chosen, null);
  assert.equal(after.done, false);
});

test('an unrecognised key is a no-op', () => {
  const state = initialState(ITEMS);
  const after = reduce(state, { name: 'f1', sequence: undefined, ctrl: false });
  assert.equal(after.cursor, state.cursor);
  assert.equal(after.done, false);
});

test('reduce does not mutate the state it is given', () => {
  const before = initialState(ITEMS);
  const snapshot = { cursor: before.cursor, chosen: before.chosen, done: before.done, cancelled: before.cancelled };

  reduce(before, KEY.down);
  reduce(before, KEY.enter);
  reduce(before, KEY.escape);

  assert.equal(before.cursor, snapshot.cursor);
  assert.equal(before.chosen, snapshot.chosen);
  assert.equal(before.done, snapshot.done);
  assert.equal(before.cancelled, snapshot.cancelled);
});

test('reduce returns a new object rather than the same reference', () => {
  const before = initialState(ITEMS);
  const after = reduce(before, KEY.down);
  assert.notEqual(before, after);
});
