// Terminal output. Zero dependencies, and degrades to plain text.
//
// Colour is off when stdout is not a terminal and when NO_COLOR is set, so
// piping into a file or a CI log produces clean text.

export const ESC = '\x1b';
const enabled = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (open, close) => (text) =>
  enabled ? `${ESC}[${open}m${text}${ESC}[${close}m` : String(text);

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);

export const symbol = {
  ok: green('✓'),
  fail: red('✗'),
  warn: yellow('!'),
  bullet: dim('·'),
  arrow: dim('→'),
};

const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

/** Visible width, ignoring colour codes. */
function width(text) {
  return String(text).replace(ANSI, '').length;
}

// Piping into `head` or `less` closes stdout early. That is ordinary use, not
// a crash, and an unwritable stdout must silence output rather than abandon
// whatever install or write is in progress: a process that exits the moment
// EPIPE fires can leave a manifest half written while still reporting
// success. This flag lives here, next to every writer it guards, so "how to
// write" and "when to stop" cannot drift apart the way they did when the
// decision to exit lived in cli.mjs instead.
let outputClosed = false;

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') {
    outputClosed = true;
    return;
  }
  throw error;
});

/**
 * Test-only: put the module back to its initial state. outputClosed is
 * module level state shared by every test that imports ui.mjs, so without a
 * reset, one test setting it would silence writes in every test that runs
 * after it in the same process.
 */
/**
 * Bytes as a human readable size.
 *
 * Here rather than in each command because it is a display format: three
 * commands print sizes and had a copy each, so a change to the precision would
 * have applied to whichever one the author was looking at.
 */
export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

export function __resetOutputClosedForTest() {
  outputClosed = false;
}

/** Write raw text to stdout, unless output has already closed. */
function write(text) {
  if (outputClosed) return;
  try {
    process.stdout.write(text);
  } catch (error) {
    if (error.code === 'EPIPE') {
      outputClosed = true;
      return;
    }
    throw error;
  }
}

export function line(text = '') {
  write(`${text}\n`);
}

export function fail(text) {
  if (outputClosed) return;
  process.stderr.write(`${symbol.fail} ${text}\n`);
}

/** Left align rows into columns, padding by visible width. */
export function table(rows) {
  if (outputClosed) return;
  if (rows.length === 0) return;
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(...rows.map((row) => width(row[column] ?? ''))),
  );

  for (const row of rows) {
    const cells = row.map((cell, column) => {
      const text = String(cell ?? '');
      if (column === row.length - 1) return text;
      return text + ' '.repeat(Math.max(0, widths[column] - width(text)));
    });
    line(`  ${cells.join('  ')}`);
  }
}

/** Print validation violations under a heading. */
export function reportViolations(heading, violations) {
  if (outputClosed) return;
  if (violations.length === 0) {
    line(`${symbol.ok} ${heading}`);
    return;
  }
  const errors = violations.filter((v) => v.severity === 'error');
  line(`${errors.length > 0 ? symbol.fail : symbol.warn} ${heading}`);
  for (const violation of [...errors, ...violations.filter((v) => v.severity !== 'error')]) {
    const mark = violation.severity === 'error' ? red('error') : yellow('warn');
    line(`    ${mark} ${dim(violation.rule)}  ${violation.message}`);
  }
}
