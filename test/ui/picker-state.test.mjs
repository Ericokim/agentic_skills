import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialState, reduce, visible } from '../../src/ui/picker-state.mjs';

const ITEMS = [
  { name: 'architect', description: 'Design a feature before writing code.' },
  { name: 'audit', description: 'Check a change against the standard.' },
  { name: 'check', description: 'Run the fast checks before committing.' },
];

const KEY = {
  up: { name: 'up', sequence: '\x1b[A', ctrl: false },
  down: { name: 'down', sequence: '\x1b[B', ctrl: false },
  k: { name: 'k', sequence: 'k', ctrl: false },
  j: { name: 'j', sequence: 'j', ctrl: false },
  space: { name: 'space', sequence: ' ', ctrl: false },
  a: { name: 'a', sequence: 'a', ctrl: false },
  enter: { name: 'return', sequence: '\r', ctrl: false },
  escape: { name: 'escape', sequence: '\x1b', ctrl: false },
  ctrlC: { name: 'c', sequence: '\x03', ctrl: true },
  backspace: { name: 'backspace', sequence: '\x7f', ctrl: false },
  char: (c) => ({ name: c, sequence: c, ctrl: false }),
};

test('initialState starts at the top, nothing selected, no search', () => {
  const state = initialState(ITEMS);
  assert.equal(state.cursor, 0);
  assert.equal(state.selected.size, 0);
  assert.equal(state.search, '');
  assert.equal(state.done, false);
  assert.equal(state.cancelled, false);
  assert.deepEqual(visible(state), ITEMS);
});

test('down moves the cursor forward', () => {
  const state = reduce(initialState(ITEMS), KEY.down);
  assert.equal(state.cursor, 1);
});

test('j also moves the cursor forward', () => {
  const state = reduce(initialState(ITEMS), KEY.j);
  assert.equal(state.cursor, 1);
});

test('up moves the cursor backward', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.up);
  assert.equal(state.cursor, 0);
});

test('k also moves the cursor backward', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.k);
  assert.equal(state.cursor, 0);
});

test('down wraps from the last item to the first', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.down);
  assert.equal(state.cursor, 0);
});

test('up wraps from the first item to the last', () => {
  const state = reduce(initialState(ITEMS), KEY.up);
  assert.equal(state.cursor, ITEMS.length - 1);
});

test('space toggles the highlighted item selected', () => {
  const state = reduce(initialState(ITEMS), KEY.space);
  assert.ok(state.selected.has('architect'));
});

test('space again deselects it', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.space);
  state = reduce(state, KEY.space);
  assert.ok(!state.selected.has('architect'));
});

test('a selects every visible item when none are selected', () => {
  const state = reduce(initialState(ITEMS), KEY.a);
  assert.deepEqual([...state.selected].sort(), ['architect', 'audit', 'check']);
});

test('a deselects every visible item when all are selected', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.a);
  state = reduce(state, KEY.a);
  assert.equal(state.selected.size, 0);
});

test('typing a character filters the visible list by name', () => {
  const state = reduce(initialState(ITEMS), KEY.char('u'));
  assert.equal(state.search, 'u');
  assert.deepEqual(
    visible(state).map((item) => item.name),
    ['audit'],
  );
});

test('typing narrows progressively', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.char('c'));
  state = reduce(state, KEY.char('h'));
  state = reduce(state, KEY.char('e'));
  assert.deepEqual(
    visible(state).map((item) => item.name),
    ['check'],
  );
});

test('backspace deletes the last search character', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.char('u'));
  state = reduce(state, KEY.backspace);
  assert.equal(state.search, '');
  assert.deepEqual(visible(state), ITEMS);
});

test('backspace on an empty search is a no-op', () => {
  const state = reduce(initialState(ITEMS), KEY.backspace);
  assert.equal(state.search, '');
});

test('cursor clamps into the filtered list when the filter shrinks it', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.down); // cursor at 2, "check"
  assert.equal(state.cursor, 2);
  state = reduce(state, KEY.char('i')); // only "architect" and "audit" contain "i"
  assert.ok(state.cursor <= 1);
  assert.deepEqual(
    visible(state).map((item) => item.name),
    ['architect', 'audit'],
  );
});

test('cursor clamps to zero when the filter matches nothing', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.down);
  state = reduce(state, KEY.char('z'));
  assert.equal(state.cursor, 0);
  assert.deepEqual(visible(state), []);
});

test('enter with a selection confirms and is not cancelled', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.space);
  state = reduce(state, KEY.enter);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, false);
  assert.ok(state.selected.has('architect'));
});

test('enter with nothing selected cancels rather than confirming empty', () => {
  const state = reduce(initialState(ITEMS), KEY.enter);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, true);
});

test('escape cancels', () => {
  const state = reduce(initialState(ITEMS), KEY.escape);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, true);
});

test('ctrl+c cancels', () => {
  const state = reduce(initialState(ITEMS), KEY.ctrlC);
  assert.equal(state.done, true);
  assert.equal(state.cancelled, true);
});

test('escape cancels even with a selection already made', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.space);
  state = reduce(state, KEY.escape);
  assert.equal(state.cancelled, true);
});

test('reduce does not mutate the state it is given', () => {
  const before = initialState(ITEMS);
  const beforeSnapshot = {
    cursor: before.cursor,
    selected: new Set(before.selected),
    search: before.search,
    done: before.done,
    cancelled: before.cancelled,
  };
  reduce(before, KEY.space);
  reduce(before, KEY.down);
  reduce(before, KEY.char('x'));
  reduce(before, KEY.enter);

  assert.equal(before.cursor, beforeSnapshot.cursor);
  assert.deepEqual([...before.selected], [...beforeSnapshot.selected]);
  assert.equal(before.search, beforeSnapshot.search);
  assert.equal(before.done, beforeSnapshot.done);
  assert.equal(before.cancelled, beforeSnapshot.cancelled);
});

test('reduce returns a new object rather than the same reference', () => {
  const before = initialState(ITEMS);
  const after = reduce(before, KEY.down);
  assert.notEqual(before, after);
});

test('j, k, and a are reserved for navigation and select-all, not search text', () => {
  let state = initialState(ITEMS);
  state = reduce(state, KEY.j);
  state = reduce(state, KEY.k);
  state = reduce(state, KEY.a);
  assert.equal(state.search, '');
});

test('visible returns every item when search is empty', () => {
  assert.deepEqual(visible(initialState(ITEMS)), ITEMS);
});

test('an unrecognised key is a no-op', () => {
  const state = initialState(ITEMS);
  const after = reduce(state, { name: 'f1', sequence: undefined, ctrl: false });
  assert.equal(after.cursor, state.cursor);
  assert.equal(after.search, state.search);
  assert.equal(after.done, false);
});
