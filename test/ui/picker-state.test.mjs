import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialState, reduce, selectedSummary, visible } from '../../src/ui/picker-state.mjs';

const ITEMS = [
  { name: 'architect', description: 'Design a feature before writing code.' },
  { name: 'audit', description: 'Check a change against the standard.' },
  { name: 'check', description: 'Run the fast checks before committing.' },
];

const KEY = {
  up: { name: 'up', sequence: '\x1b[A', ctrl: false },
  down: { name: 'down', sequence: '\x1b[B', ctrl: false },
  space: { name: 'space', sequence: ' ', ctrl: false },
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
  // The filtered list has 2 items (indices 0-1); a cursor of 2 must clamp
  // down to the new last index, 1 - not just "some" in-bounds value, and
  // not a full reset to 0, which a broken clamp that always zeroed the
  // cursor would also satisfy.
  assert.equal(state.cursor, 1);
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

test('typing a letter that used to be a shortcut goes to search', () => {
  let state = initialState([
    { name: 'audit', description: '' },
    { name: 'check', description: '' },
    { name: 'scope', description: '' },
  ]);
  for (const ch of 'audit') state = reduce(state, { name: ch, sequence: ch });
  assert.equal(state.search, 'audit');
  assert.deepEqual(visible(state).map((s) => s.name), ['audit']);
});

test('k and a filter rather than navigate', () => {
  let state = initialState([
    { name: 'check', description: '' },
    { name: 'scope', description: '' },
  ]);
  state = reduce(state, { name: 'k', sequence: 'k' });
  assert.equal(state.search, 'k');
  assert.equal(state.cursor, 0);
  assert.deepEqual(visible(state).map((s) => s.name), ['check']);
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

// --- Step 2 additions: group header, always-included entries, hints, and
// the "Selected: ..." footer. Every test above this line must keep passing
// unchanged - these only cover the new, optional behaviour.

const AGENT_ITEMS = [
  { name: 'claude-code', label: 'Claude Code', hint: '.claude/skills' },
  { name: 'codex', label: 'Codex', hint: '.agents/skills' },
  { name: 'cursor', label: 'Cursor', hint: '.cursor/rules' },
];

test('initialState with no options behaves exactly as before: no group, no always entries, nothing preselected', () => {
  const state = initialState(AGENT_ITEMS);
  assert.equal(state.group, null);
  assert.deepEqual(state.always, []);
  assert.equal(state.alwaysLabel, null);
  assert.equal(state.selected.size, 0);
});

test('initialState carries an optional group header through unchanged', () => {
  const state = initialState(AGENT_ITEMS, { group: 'Additional agents' });
  assert.equal(state.group, 'Additional agents');
});

test('initialState carries an optional always-included list and label through unchanged', () => {
  const state = initialState(AGENT_ITEMS, {
    always: ['Codex', 'Gemini CLI', 'any Agent Skills client'],
    alwaysLabel: 'Universal (.agents/skills) — always included',
  });
  assert.deepEqual(state.always, ['Codex', 'Gemini CLI', 'any Agent Skills client']);
  assert.equal(state.alwaysLabel, 'Universal (.agents/skills) — always included');
});

test('the always list is not part of the selectable items and cannot be reached by the cursor', () => {
  const state = initialState(AGENT_ITEMS, { always: ['Codex', 'Gemini CLI'] });
  assert.deepEqual(
    visible(state).map((item) => item.name),
    ['claude-code', 'codex', 'cursor'],
  );
});

test('initialState preselects items by name', () => {
  const state = initialState(AGENT_ITEMS, { selected: ['claude-code'] });
  assert.ok(state.selected.has('claude-code'));
  assert.equal(state.selected.size, 1);
});

test('a preselected item can be toggled off like any other', () => {
  let state = initialState(AGENT_ITEMS, { selected: ['claude-code'] });
  state = reduce(state, KEY.space); // cursor starts on claude-code
  assert.ok(!state.selected.has('claude-code'));
});

test('items carry an optional hint alongside name and label', () => {
  const state = initialState(AGENT_ITEMS);
  assert.equal(visible(state)[0].hint, '.claude/skills');
});

test('selectedSummary reports "(none)" when nothing is selected', () => {
  assert.equal(selectedSummary(initialState(AGENT_ITEMS)), 'Selected: (none)');
});

test('selectedSummary lists chosen items by label, in item order, not selection order', () => {
  let state = initialState(AGENT_ITEMS, { selected: ['cursor'] });
  state = reduce(state, KEY.down); // -> codex
  state = reduce(state, KEY.space); // select codex too
  assert.equal(selectedSummary(state), 'Selected: Codex, Cursor');
});

test('selectedSummary falls back to name when an item has no label', () => {
  const state = initialState(ITEMS, { selected: ['architect'] });
  assert.equal(selectedSummary(state), 'Selected: architect');
});

test('selectedSummary caps at three names and adds a "+N more" tail beyond that', () => {
  const items = [
    { name: 'a', label: 'Alpha' },
    { name: 'b', label: 'Bravo' },
    { name: 'c', label: 'Charlie' },
    { name: 'd', label: 'Delta' },
    { name: 'e', label: 'Echo' },
  ];
  const state = initialState(items, { selected: ['a', 'b', 'c', 'd', 'e'] });
  assert.equal(selectedSummary(state), 'Selected: Alpha, Bravo, Charlie +2 more');
});

test('selectedSummary shows every name when the count is exactly the limit', () => {
  const items = [
    { name: 'a', label: 'Alpha' },
    { name: 'b', label: 'Bravo' },
    { name: 'c', label: 'Charlie' },
  ];
  const state = initialState(items, { selected: ['a', 'b', 'c'] });
  assert.equal(selectedSummary(state), 'Selected: Alpha, Bravo, Charlie');
});
