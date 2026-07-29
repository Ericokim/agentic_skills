// The terminal loop for the skill picker: raw mode, rendering, restoration.
//
// This file owns no decision logic of its own. Every keypress goes straight
// into src/ui/picker-state.mjs's reduce(), and this file only turns the state
// that comes back into ANSI. That split is what makes the picker's behaviour
// testable without a terminal.
//
// Terminal safety is the point of this file: a raw-mode stdin left without a
// cursor and without echo is worse than a tool with no picker at all, so
// restore() runs on every exit path this loop can take — confirming,
// cancelling, ctrl+c, and a thrown error alike.

import readline from 'node:readline';

import { bold, cyan, dim, ESC, symbol } from '../ui.mjs';
import { initialState, reduce, visible } from './picker-state.mjs';

const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const cursorUp = (n) => `${ESC}[${n}A`;

const HINT = 'up/down or j/k move, space select, a all, enter confirm, esc cancel';

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

function renderFrame(state, columns) {
  const items = visible(state);
  const lines = [];

  lines.push(`${symbol.arrow} ${bold('Select skills to install')} ${dim(`(${state.items.length} found)`)}`);
  lines.push(`  Search: ${state.search}`);
  lines.push(`  ${dim(HINT)}`);
  lines.push('');

  if (items.length === 0) {
    lines.push(`  ${dim('no skills match')}`);
  } else {
    items.forEach((item, index) => {
      const onCursor = index === state.cursor;
      const box = state.selected.has(item.name) ? '◉' : '○';
      const marker = onCursor ? cyan('❯') : ' ';
      const name = onCursor ? bold(item.name) : item.name;
      lines.push(`${marker} ${box} ${name}`);
    });
  }

  lines.push('');
  lines.push(`  ${bold('Description')}`);
  const current = items[Math.min(state.cursor, items.length - 1)];
  const wrapped = current ? wrap(current.description ?? '', Math.max(10, columns - 4)).slice(0, 3) : [];
  if (wrapped.length === 0) lines.push(`  ${dim('(none)')}`);
  for (const wrappedLine of wrapped) lines.push(`  ${dim(wrappedLine)}`);

  return lines;
}

/**
 * Run the interactive skill picker.
 *
 * @param {{name: string, description: string}[]} items
 * @param {{input?: import('node:tty').ReadStream, output?: import('node:tty').WriteStream}} streams
 * @returns {Promise<string[] | null>} chosen skill names, or null when cancelled
 */
export function pickSkills(items, { input = process.stdin, output = process.stdout } = {}) {
  // Never enter the loop off a TTY: there is no keypress stream to read from,
  // and raw mode on a non-TTY stream either throws or does nothing useful.
  if (!input.isTTY || !output.isTTY) return Promise.resolve(null);

  return new Promise((resolvePromise, rejectPromise) => {
    let state = initialState(items);
    let linesWritten = 0;
    let restored = false;

    // Every step here is independently guarded. Restoration runs from within
    // an error path as often as a clean one, so one step failing (stdout
    // closed early, EPIPE, whatever) must never stop the rest from running -
    // the raw-mode-off and unref calls matter even when the cursor write
    // itself fails.
    function restore() {
      if (restored) return;
      restored = true;
      try {
        input.removeListener('keypress', onKeypress);
      } catch {
        // ignore
      }
      try {
        input.setRawMode(false);
      } catch {
        // Not fatal: the process may already be tearing down.
      }
      try {
        output.write(SHOW_CURSOR);
      } catch {
        // stdout may already be gone (e.g. piped into something that closed)
      }
      try {
        input.pause();
      } catch {
        // ignore
      }
      try {
        input.unref?.();
      } catch {
        // ignore
      }
    }

    function render() {
      const columns = output.columns || 80;
      const frame = renderFrame(state, columns);
      if (linesWritten > 0) output.write(cursorUp(linesWritten));
      const rows = Math.max(frame.length, linesWritten);
      for (let index = 0; index < rows; index += 1) {
        output.write(`${CLEAR_LINE}${frame[index] ?? ''}\n`);
      }
      if (rows > frame.length) output.write(cursorUp(rows - frame.length));
      linesWritten = frame.length;
    }

    function finish(result) {
      restore();
      resolvePromise(result);
    }

    function onKeypress(_str, key) {
      let next;
      try {
        next = reduce(state, key ?? {});
      } catch (error) {
        restore();
        rejectPromise(error);
        return;
      }
      state = next;

      if (state.done) {
        finish(state.cancelled ? null : [...state.selected]);
        return;
      }

      try {
        render();
      } catch (error) {
        restore();
        rejectPromise(error);
      }
    }

    try {
      readline.emitKeypressEvents(input);
      input.setRawMode(true);
      input.resume();
      output.write(HIDE_CURSOR);
      render();
      input.on('keypress', onKeypress);
    } catch (error) {
      restore();
      rejectPromise(error);
    }
  });
}
