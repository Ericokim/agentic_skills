// Framed step output for interactive commands: an open rail on the left
// tracking a sequence of steps down to an active picker, closed off once the
// picker resolves.
//
// Pure string builders, no I/O. That split lets the framed layout be tested
// without a terminal, the same reason src/ui/picker-state.mjs stays pure and
// src/ui/picker.mjs owns the terminal loop around it.

import { cyan, dim, green } from '../ui.mjs';

/** Opens the frame: the tool name at the top of the rail. */
export function frameOpen(label) {
  return `${dim('┌')}   ${label}`;
}

/** A bare rail line separating steps. */
export function frameBar() {
  return dim('│');
}

/** A completed step, marked done. */
export function frameStep(text) {
  return `${green('◇')}  ${text}`;
}

/** The active step: the picker header. */
export function frameActive(text) {
  return `${cyan('◆')}  ${text}`;
}

/** A plain line inside the frame, indented under the rail. */
export function frameLine(text) {
  return `${dim('│')}  ${text}`;
}

/** An item row inside the frame: the rail with no extra indent. */
export function frameItem(text) {
  return `${dim('│')} ${text}`;
}

/** Closes the frame once the active step resolves. */
export function frameClose() {
  return dim('└');
}
