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
import { frameActive, frameBar, frameItem, frameLine } from './frame.mjs';
import { initialState, reduce, selectedSummary, visible } from './picker-state.mjs';

const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const cursorUp = (n) => `${ESC}[${n}A`;

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
  // Never enter the loop off a TTY: there is no keypress stream to read from,
  // and raw mode on a non-TTY stream either throws or does nothing useful.
  if (!input.isTTY || !output.isTTY) return Promise.resolve(null);

  return new Promise((resolvePromise, rejectPromise) => {
    let state = initialState(items, { group, always, alwaysLabel, selected });
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
      const frame = renderFrame(state, columns, title);
      if (linesWritten > 0) output.write(cursorUp(linesWritten));
      const rows = Math.max(frame.length, linesWritten);
      for (let index = 0; index < rows; index += 1) {
        output.write(`${CLEAR_LINE}${frame[index] ?? ''}\n`);
      }
      if (rows > frame.length) output.write(cursorUp(rows - frame.length));
      linesWritten = frame.length;
    }

    function finish(result) {
      erase();
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

    // stdin can close or error out from under the picker - the other end of
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
