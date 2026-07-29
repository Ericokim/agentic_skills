// The single-select frame (installation scope, and any future
// choose-exactly-one step): what a frame looks like, not how a terminal
// session is run. Every keypress goes straight into src/ui/select-state.mjs's
// reduce(); src/ui/prompt.mjs owns the terminal loop - raw mode, the
// render/reduce cycle, restoration on every exit path - shared with
// src/ui/picker.mjs. That split is what makes the behaviour testable without
// a terminal.

import { bold, dim } from '../ui.mjs';
import { frameActive, frameLine } from './frame.mjs';
import { runPrompt } from './prompt.mjs';
import { initialState, reduce } from './select-state.mjs';

const HINT = '↑/↓ to navigate • Enter: confirm';

function renderFrame(state, title) {
  const lines = [];
  lines.push(frameActive(bold(title)));

  state.items.forEach((item, index) => {
    const marker = index === state.cursor ? '●' : '○';
    const suffix = item.hint ? ` (${item.hint})` : '';
    lines.push(frameLine(`${marker} ${item.label}${suffix}`));
  });

  lines.push(frameLine(dim(HINT)));
  return lines;
}

/**
 * Run an interactive single-select prompt.
 *
 * @param {{id: string, label: string, hint?: string}[]} items
 * @param {{input?: import('node:tty').ReadStream, output?: import('node:tty').WriteStream, title?: string}} options
 * @returns {Promise<string|null>} the chosen item's id, or null when cancelled
 */
export function pickOne(items, { input = process.stdin, output = process.stdout, title = 'Choose one' } = {}) {
  return runPrompt({
    input,
    output,
    initialState: initialState(items),
    reduce,
    renderFrame: (state) => renderFrame(state, title),
    isDone: (state) => state.done,
    result: (state) => (state.cancelled ? null : state.chosen),
  });
}
