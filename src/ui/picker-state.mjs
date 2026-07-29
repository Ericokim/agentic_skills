// Pure state for the skill picker. No I/O, no node:readline, no ANSI.
//
// This is a reducer over plain objects: initialState builds one, reduce steps
// it forward one keypress at a time, visible applies the search filter. That
// split is what lets the interactive picker be tested without a terminal —
// src/ui/picker.mjs owns the terminal loop and contains no decision logic of
// its own, it just feeds keypress events in here and renders what comes back.
//
// Only up/down and space are reserved for navigation and selecting; every
// other printable character is search text, with no exceptions. That is
// deliberate: typing a skill's name has to work even when that name starts
// with a letter that some other picker might bind to a shortcut.

/**
 * @param {{name: string, description: string}[]} items
 */
export function initialState(items) {
  return {
    items: items.slice(),
    cursor: 0,
    selected: new Set(),
    search: '',
    done: false,
    cancelled: false,
  };
}

function matches(item, search) {
  if (search === '') return true;
  return item.name.toLowerCase().includes(search.toLowerCase());
}

/** Items currently shown, applying the search filter. */
export function visible(state) {
  return state.items.filter((item) => matches(item, state.search));
}

/** Cursor pulled back inside [0, length - 1], or 0 when the list is empty. */
function clampCursor(cursor, length) {
  if (length === 0) return 0;
  return Math.min(Math.max(cursor, 0), length - 1);
}

function cancel(state) {
  return { ...state, done: true, cancelled: true };
}

function moveCursor(state, delta) {
  const count = visible(state).length;
  if (count === 0) return { ...state };
  const cursor = (state.cursor + delta + count) % count;
  return { ...state, cursor };
}

function toggleSelected(state) {
  const items = visible(state);
  if (items.length === 0) return { ...state };
  const cursor = clampCursor(state.cursor, items.length);
  const target = items[cursor].name;
  const selected = new Set(state.selected);
  if (selected.has(target)) selected.delete(target);
  else selected.add(target);
  return { ...state, cursor, selected };
}

function setSearch(state, search) {
  const cursor = clampCursor(state.cursor, visible({ ...state, search }).length);
  return { ...state, search, cursor };
}

function backspace(state) {
  if (state.search.length === 0) return { ...state };
  return setSearch(state, state.search.slice(0, -1));
}

function typeChar(state, char) {
  return setSearch(state, state.search + char);
}

function confirm(state) {
  if (state.selected.size === 0) return cancel(state);
  return { ...state, done: true, cancelled: false };
}

/**
 * Step the state forward by one keypress.
 *
 * @param {object} state
 * @param {{name?: string, sequence?: string, ctrl?: boolean}} key shaped like
 *   what node:readline's `keypress` event emits
 * @returns {object} a new state; `state` is never mutated
 */
export function reduce(state, key = {}) {
  const { name, sequence, ctrl } = key;

  if (ctrl && name === 'c') return cancel(state);
  if (name === 'escape') return cancel(state);
  if (name === 'return' || name === 'enter') return confirm(state);
  if (name === 'up') return moveCursor(state, -1);
  if (name === 'down') return moveCursor(state, 1);
  if (name === 'space') return toggleSelected(state);
  if (name === 'backspace') return backspace(state);

  // Every other single, non-ctrl character typed is search text — including
  // letters that used to be shortcuts elsewhere, like j, k, and a.
  if (!ctrl && typeof sequence === 'string' && sequence.length === 1 && sequence >= ' ') {
    return typeChar(state, sequence);
  }

  return { ...state };
}
