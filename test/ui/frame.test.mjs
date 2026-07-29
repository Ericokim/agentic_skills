import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  frameActive,
  frameBar,
  frameClose,
  frameItem,
  frameLine,
  frameOpen,
  frameStep,
} from '../../src/ui/frame.mjs';

// Colour is off here the same way it is for every other test in this repo:
// src/ui.mjs only turns colour on when stdout is a TTY, and `node --test`
// does not run against one. That is what lets these assertions compare
// exact, uncoloured strings.

test('frameOpen gives the rail opening with the tool name', () => {
  assert.equal(frameOpen('agentic'), '┌   agentic');
});

test('frameBar gives a bare rail line', () => {
  assert.equal(frameBar(), '│');
});

test('frameStep gives a completed step', () => {
  assert.equal(frameStep('Repository cloned'), '◇  Repository cloned');
});

test('frameActive gives the active step', () => {
  assert.equal(frameActive('Select skills to install'), '◆  Select skills to install');
});

test('frameLine gives a plain line under the rail', () => {
  assert.equal(frameLine('Search:'), '│  Search:');
});

test('frameItem gives an item row under the rail', () => {
  assert.equal(frameItem('❯ ○ architect'), '│ ❯ ○ architect');
});

test('frameClose gives the rail closing', () => {
  assert.equal(frameClose(), '└');
});
