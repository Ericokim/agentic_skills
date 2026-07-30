// Output surviving a closed pipe.
//
// `agentic validate skills/ | head -3` closes stdout while the command is still
// writing. Node raises EPIPE, and an earlier version of this project handled it
// by exiting the process, which abandoned work half done and still reported
// success. ui.mjs now silences further writes and lets the command finish.
//
// The obvious harness for this is a shell pipeline, and it does not work: a
// pipeline reports the exit status of its LAST command, so the writer's own code
// is invisible, and output smaller than the 64KB pipe buffer never raises EPIPE
// at all. Written that way these tests passed with the handling deliberately
// replaced by process.exit(3), which is no test at all.
//
// So: spawn a child that writes far more than the buffer through ui.mjs, destroy
// the read end from the parent, and assert on the child's own exit code and on a
// completion marker it prints to stderr, which stays open. Verified to fail when
// the EPIPE branch is broken.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname;
const UI = join(REPO, 'src', 'ui.mjs');

/**
 * Run a child that writes `lines` lines through ui.mjs, with its stdout
 * destroyed as soon as it starts, then report how it ended.
 */
function writeIntoAClosedPipe(lines) {
  const source = `
    const { line } = await import(${JSON.stringify(UI)});
    for (let i = 0; i < ${lines}; i++) line('a line of output padded out to force the buffer to fill ' + i);
    process.stderr.write('REACHED THE END\\n');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c.toString(); });
  // Close the read end immediately: the child's writes now have nowhere to go.
  child.stdout.destroy();

  return new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal, stderr }));
  });
}

test('a command whose stdout closes mid write still runs to completion', async () => {
  const { code, signal, stderr } = await writeIntoAClosedPipe(20_000);
  assert.equal(signal, null, `killed by ${signal} instead of finishing`);
  assert.equal(code, 0, `expected a clean exit, got ${code}. stderr: ${stderr}`);
  assert.match(stderr, /REACHED THE END/, 'the work after the failed write was abandoned');
});

test('a closed pipe raises no EPIPE and no unhandled error', async () => {
  const { stderr } = await writeIntoAClosedPipe(20_000);
  assert.doesNotMatch(stderr, /EPIPE/, stderr);
  assert.doesNotMatch(stderr, /Unhandled|ERR_STREAM|throw/, stderr);
});

test('an open stdout is unaffected', async () => {
  const child = spawn(process.execPath, [join(REPO, 'src', 'cli.mjs'), 'build', '--check'], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (c) => { stdout += c.toString(); });
  const code = await new Promise((r) => child.on('exit', r));
  assert.equal(code, 0);
  assert.match(stdout, /nothing stale/);
});
