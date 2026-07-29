// Pure state for a single-select prompt (installation scope, and any future
// choose-exactly-one step). Mirrors the split in picker-state.mjs: this file
// only knows how to step a plain object forward one keypress at a time,
// src/ui/select.mjs owns the terminal loop and turns what comes back into
// ANSI. Imports nothing.
//
// Deliberately simpler than the multiselect picker: there is no search to
// filter, and nothing to toggle. Arrows move a cursor over a short, fixed
// list and enter takes whichever item it lands on.

/**
 * @param {{id: string, label: string, hint?: string}[]} items
 */
export function initialState(items) {
  return {
    items: items.slice(),
    cursor: 0,
    chosen: null,
    done: false,
    cancelled: false,
  };
}

function cancel(state) {
  return { ...state, done: true, cancelled: true };
}

function moveCursor(state, delta) {
  const count = state.items.length;
  if (count === 0) return { ...state };
  const cursor = (state.cursor + delta + count) % count;
  return { ...state, cursor };
}

function confirm(state) {
  if (state.items.length === 0) return cancel(state);
  return { ...state, chosen: state.items[state.cursor].id, done: true, cancelled: false };
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
  const { name, ctrl } = key;

  if (ctrl && name === 'c') return cancel(state);
  if (name === 'escape') return cancel(state);
  if (name === 'return' || name === 'enter') return confirm(state);
  if (name === 'up') return moveCursor(state, -1);
  if (name === 'down') return moveCursor(state, 1);

  // Space and every other key are deliberate no-ops here: this is a single
  // choice among a short fixed list, not something worth toggling or typing
  // into. (Space toggles in the multiselect picker; it does nothing here.)
  return { ...state };
}
