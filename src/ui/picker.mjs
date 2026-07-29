// The multiselect frame for the skill picker: what a frame looks like, not
// how a terminal session is run. Every keypress goes straight into
// src/ui/picker-state.mjs's reduce(); src/ui/prompt.mjs owns the terminal
// loop - raw mode, the render/reduce cycle, restoration on every exit path -
// shared with src/ui/select.mjs. That split is what makes the picker's
// behaviour testable without a terminal.

import { bold, cyan, dim, symbol } from '../ui.mjs';
import { frameActive, frameBar, frameItem, frameLine } from './frame.mjs';
import { initialState, reduce, selectedSummary, visible } from './picker-state.mjs';
import { runPrompt } from './prompt.mjs';

const HINT = '↑↓ move, space select, enter confirm';

/** Greedy word wrap to a width, no single line exceeding it. */
function wrap(text, width) {
  const usable = Math.max(20, width);
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > usable && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderFrame(state, columns, title) {
  const items = visible(state);
  const lines = [];
  // Step 2 (choosing agent targets) turns on a second layout: a Universal
  // section of always-included, unselectable entries, a group header over
  // the selectable list, and a "Selected: ..." footer instead of the
  // description panel step 1 uses. Neither `always` nor `group` is ever set
  // by step 1's call, so that layout renders exactly as it always has.
  const extended = state.always.length > 0 || Boolean(state.group);

  lines.push(frameActive(bold(title)));

  // Step 1 never sets `always`, so this whole block - including the extra
  // rail line separating it from the search box - is invisible there, and
  // that layout is exactly what it always was: header straight into Search.
  if (state.always.length > 0) {
    lines.push(frameBar());
    if (state.alwaysLabel) lines.push(frameLine(bold(state.alwaysLabel)));
    for (const entry of state.always) lines.push(frameLine(`  ${symbol.bullet} ${entry}`));
    lines.push(frameBar());
  }

  if (state.group) lines.push(frameLine(bold(state.group)));
  lines.push(frameLine(`Search: ${state.search}`));
  lines.push(frameLine(dim(HINT)));
  lines.push(frameBar());

  if (items.length === 0) {
    lines.push(frameLine(dim('nothing matches')));
  } else {
    items.forEach((item, index) => {
      const onCursor = index === state.cursor;
      const box = state.selected.has(item.name) ? '◉' : '○';
      const marker = onCursor ? cyan('❯') : ' ';
      const label = item.label ?? item.name;
      const name = onCursor ? bold(label) : label;
      const hint = item.hint ? ` ${dim(`(${item.hint})`)}` : '';
      lines.push(frameItem(`${marker} ${box} ${name}${hint}`));
    });
  }

  lines.push(frameBar());
  if (extended) {
    lines.push(frameLine(selectedSummary(state)));
  } else {
    lines.push(frameLine(bold('Description')));
    const current = items[Math.min(state.cursor, items.length - 1)];
    const wrapped = current ? wrap(current.description ?? '', Math.max(10, columns - 4)).slice(0, 3) : [];
    if (wrapped.length === 0) lines.push(frameLine(dim('(none)')));
    for (const wrappedLine of wrapped) lines.push(frameLine(dim(wrappedLine)));
  }

  return lines;
}

/**
 * Run the interactive multiselect picker.
 *
 * @param {{name: string, description?: string, label?: string, hint?: string}[]} items
 * @param {{
 *   input?: import('node:tty').ReadStream,
 *   output?: import('node:tty').WriteStream,
 *   title?: string,
 *   group?: string,
 *   always?: string[],
 *   alwaysLabel?: string,
 *   selected?: string[],
 * }} options
 * @returns {Promise<string[] | null>} chosen item names, or null when cancelled
 */
export function pickSkills(
  items,
  {
    input = process.stdin,
    output = process.stdout,
    title = 'Select skills to install',
    group = null,
    always = [],
    alwaysLabel = null,
    selected = [],
  } = {},
) {
  return runPrompt({
    input,
    output,
    initialState: initialState(items, { group, always, alwaysLabel, selected }),
    reduce,
    renderFrame: (state, columns) => renderFrame(state, columns, title),
    isDone: (state) => state.done,
    result: (state) => (state.cancelled ? null : [...state.selected]),
  });
}
