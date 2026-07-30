// The terminal loop shared by every interactive prompt in this codebase:
// raw mode, the render/reduce cycle, and restoration on every exit path.
//
// src/ui/picker.mjs (the multiselect skill picker) and src/ui/select.mjs (a
// single-select prompt) used to each carry their own copy of this loop. The
// two copies were byte-identical in the parts that matter most - restore(),
// erase(), the setup/teardown around raw mode - which is exactly the wrong
// place for duplication to live: the `unref` bug that shipped to a user and
// silently killed the wizard after step 2 lived in that restore() logic, and
// had to be fixed in both copies by hand. A fix applied to one and missed in
// the other is how that class of bug comes back. Now there is one copy.
//
// This file owns no decision logic of its own. Callers supply a pure
// reducer, a renderer, and two predicates (isDone / result); this file only
// runs the loop around them - raw mode, keypress wiring, drawing, and
// guaranteed restoration - and stays exactly as ignorant of "what a picker
// looks like" as picker-state.mjs and select-state.mjs are of ANSI.

import readline from 'node:readline';

import { ESC } from '../ui.mjs';

const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const cursorUp = (n) => `${ESC}[${n}A`;

/**
 * Run an interactive terminal prompt to completion.
 *
 * @param {object} options
 * @param {import('node:tty').ReadStream} [options.input]
 * @param {import('node:tty').WriteStream} [options.output]
 * @param {object} options.initialState the starting state object
 * @param {(state: object, key: object) => object} options.reduce pure
 *   reducer: given the current state and a keypress, returns the next state
 * @param {(state: object, columns: number) => string[]} options.renderFrame
 *   returns the lines to draw for a given state
 * @param {(state: object) => boolean} options.isDone whether the prompt has
 *   finished (confirmed or cancelled) and the loop should resolve
 * @param {(state: object) => *} options.result the value to resolve with
 *   once isDone(state) is true; expected to return null itself for a
 *   cancelled state, since this loop resolves whatever result() returns
 * @returns {Promise<*>} whatever result(state) returns once done, or null
 *   when the prompt never runs (not a TTY) or is cut off from under itself
 *   (stdin closes or errors)
 */
export function runPrompt({ input = process.stdin, output = process.stdout, initialState, reduce, renderFrame, isDone, result }) {
  // Never enter the loop off a TTY: there is no keypress stream to read from,
  // and raw mode on a non-TTY stream either throws or does nothing useful.
  if (!input.isTTY || !output.isTTY) return Promise.resolve(null);

  return new Promise((resolvePromise, rejectPromise) => {
    let state = initialState;
    let linesWritten = 0;
    let restored = false;

    // Every step here is independently guarded. Restoration runs from within
    // an error path as often as a clean one, so one step failing (stdout
    // closed early, EPIPE, whatever) must never stop the rest from running -
    // the raw-mode-off call matters even when the cursor write itself fails.
    //
    // No unref() here. It used to end this function, meant to let the
    // process exit after the LAST prompt of a run - but pause() already does
    // that: a paused stdin holds no reference of its own, so once nothing
    // else keeps the event loop alive the process exits promptly on its own,
    // with no unref needed (verified directly: a paused, not-unrefed stdin
    // lets a bare Node script exit immediately). Calling unref() here bought
    // nothing and cost a real bug - a second prompt's resume() has no
    // matching ref(), so a run with more than one prompt (every wizard in
    // this codebase) would unref stdin after step 1 and then, on step 2,
    // resume a stream nothing was holding open. The process would exit the
    // instant step 2 finished rendering, mid-wizard, silently, having
    // installed nothing. Fake-stream tests never caught this: a PassThrough
    // has no ref/unref at all, so `input.unref?.()` was a silent no-op there
    // by construction.
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
    }

    // Erases the frame this prompt drew, moving the cursor back to the line
    // the frame started on. Without this, the caller's collapsed "done" line
    // for this step gets printed below the still-on-screen live frame
    // instead of in its place, and the step appears twice - the live picker
    // with its description panel, and the collapsed summary underneath it.
    function erase() {
      if (linesWritten === 0) return;
      try {
        output.write(cursorUp(linesWritten));
        for (let index = 0; index < linesWritten; index += 1) {
          output.write(`${CLEAR_LINE}\n`);
        }
        output.write(cursorUp(linesWritten));
      } catch {
        // stdout may already be gone; nothing left to erase for
      }
      linesWritten = 0;
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

    function finish(value) {
      erase();
      restore();
      resolvePromise(value);
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

      if (isDone(state)) {
        finish(result(state));
        return;
      }

      try {
        render();
      } catch (error) {
        restore();
        rejectPromise(error);
      }
    }

    // stdin can close or error out from under the prompt - the other end of
    // a pipe going away, a terminal getting killed, whatever. Nothing else
    // in this file would ever call restore() for that: there is no keypress
    // coming, so onKeypress never fires and the promise would otherwise hang
    // forever with raw mode still on and the cursor still hidden. Treat it
    // exactly like escape - a cancellation, not an error.
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
      // Paired with resume(), not with the unref() restore() no longer has
      // (see the comment there): this is the defensive half of the pair, in
      // case anything upstream of this prompt ever left stdin unrefed.
      input.ref?.();
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
