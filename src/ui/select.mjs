// The terminal loop for a single-select prompt (installation scope, and any
// future choose-exactly-one step). Every keypress goes straight into
// src/ui/select-state.mjs's reduce(); this file only turns the state that
// comes back into ANSI. That split is the same one src/ui/picker.mjs uses,
// and for the same reason: it is what makes the behaviour testable without a
// terminal.
//
// Terminal safety is the point of this file, exactly as it is in picker.mjs:
// restore() runs on every exit path - confirming, cancelling, ctrl+c, a
// thrown error, and stdin closing out from under the prompt alike.

import readline from 'node:readline';

import { bold, dim, ESC } from '../ui.mjs';
import { frameActive, frameLine } from './frame.mjs';
import { initialState, reduce } from './select-state.mjs';

const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const cursorUp = (n) => `${ESC}[${n}A`;

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
  // Never enter the loop off a TTY: there is no keypress stream to read from,
  // and raw mode on a non-TTY stream either throws or does nothing useful.
  if (!input.isTTY || !output.isTTY) return Promise.resolve(null);

  return new Promise((resolvePromise, rejectPromise) => {
    let state = initialState(items);
    let linesWritten = 0;
    let restored = false;

    // Every step here is independently guarded, the same discipline
    // picker.mjs's restore() uses: this runs from an error path as often as a
    // clean one, so one step failing must never stop the rest from running.
    function restore() {
      if (restored) return;
      restored = true;
      try {
        input.removeListener('keypress', onKeypress);
        input.removeListener('close', onEnd);
        input.removeListener('end', onEnd);
        input.removeListener('error', onError);
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
      const frame = renderFrame(state, title);
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
        finish(state.cancelled ? null : state.chosen);
        return;
      }

      try {
        render();
      } catch (error) {
        restore();
        rejectPromise(error);
      }
    }

    // stdin closing or erroring out from under the prompt must resolve, not
    // hang forever with raw mode still on. Treat it exactly like escape - a
    // cancellation, not an error. See picker.mjs's onEnd for the full story.
    function onEnd() {
      finish(null);
    }

    function onError() {
      finish(null);
    }

    try {
      readline.emitKeypressEvents(input);
      input.setRawMode(true);
      input.resume();
      output.write(HIDE_CURSOR);
      render();
      input.on('keypress', onKeypress);
      input.on('close', onEnd);
      input.on('end', onEnd);
      input.on('error', onError);
    } catch (error) {
      restore();
      rejectPromise(error);
    }
  });
}
