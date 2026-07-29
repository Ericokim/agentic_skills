// An unwritable stdout (piped into `head`, `less`, anything that closes
// early) must silence output, not abandon whatever work is in progress. See
// src/ui.mjs for the outputClosed flag these writers all check.
//
// These tests drive the flag through the synchronous-throw path only (a
// mocked process.stdout.write that throws an EPIPE error), never by emitting
// a real 'error' event on the shared process.stdout: node's own test runner
// also listens for errors on that stream to report broken-pipe output, and a
// synthetic emit on the live object was observed to disrupt its own TAP
// reporting for the rest of the run. The synchronous-throw path exercises the
// same flag and the same writers, so it is enough to prove the behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { __resetOutputClosedForTest, fail, line, table, reportViolations } from '../../src/ui.mjs';

// outputClosed is module level state shared by every test in this file (the
// module is imported once and cached). Reset it before and after each test so
// one test setting it can never silence writes in a test that runs after it.
test.beforeEach(() => __resetOutputClosedForTest());
test.afterEach(() => __resetOutputClosedForTest());

/** Swap process.stdout.write for the duration of fn, then restore it. */
async function withStdoutWrite(replacement, fn) {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = replacement;
  try {
    return await fn();
  } finally {
    process.stdout.write = original;
  }
}

function epipe() {
  return Object.assign(new Error('EPIPE'), { code: 'EPIPE' });
}

test('a write that throws EPIPE synchronously is swallowed, and subsequent writes stay silent', async () => {
  let calls = 0;
  await withStdoutWrite(
    () => {
      calls += 1;
      throw epipe();
    },
    async () => {
      // The first call reaches the mock, throws EPIPE, and that throw must
      // not escape line().
      assert.doesNotThrow(() => line('first write throws EPIPE'));
      assert.equal(calls, 1);

      // The flag that throw set must keep every later writer from calling
      // process.stdout.write a second time at all.
      assert.doesNotThrow(() => line('second write'));
      assert.doesNotThrow(() => table([['a', 'b']]));
      assert.doesNotThrow(() => reportViolations('heading', []));
      assert.doesNotThrow(() => fail('should stay silent too'));
      assert.equal(calls, 1, 'no writer should have reached stdout.write again once EPIPE fired');
    },
  );
});

test('once the EPIPE flag is set, line() writes nothing and does not throw', async () => {
  let calls = 0;
  await withStdoutWrite(
    () => {
      calls += 1;
      throw epipe();
    },
    async () => {
      // Set the flag the same way production code would: a synchronous
      // EPIPE thrown from the real write.
      line('sets the flag');
      assert.equal(calls, 1);
    },
  );

  await withStdoutWrite(
    () => {
      throw new Error('write must not be called once output has closed');
    },
    async () => {
      assert.doesNotThrow(() => line('should not appear'));
      assert.doesNotThrow(() => table([['should', 'not', 'appear']]));
      assert.doesNotThrow(() => reportViolations('should not appear', []));
      assert.doesNotThrow(() => fail('should not appear'));
    },
  );
});

test('a non-EPIPE error from stdout is not swallowed', async () => {
  await withStdoutWrite(
    () => {
      throw new Error('disk on fire');
    },
    async () => {
      assert.throws(() => line('boom'), /disk on fire/);
    },
  );
});
