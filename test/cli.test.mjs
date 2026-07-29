import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv } from '../src/cli.mjs';

test('separates the command from its arguments', () => {
  const { command, args } = parseArgv(['add', 'github:eric/x']);
  assert.equal(command, 'add');
  assert.deepEqual(args, ['github:eric/x']);
});

test('returns a null command for no arguments', () => {
  assert.equal(parseArgv([]).command, null);
});

test('collects a repeated target flag', () => {
  const { flags } = parseArgv(['add', '-t', 'claude-code', '-t', 'codex']);
  assert.deepEqual(flags.target, ['claude-code', 'codex']);
});

test('splits a comma separated target list', () => {
  const { flags } = parseArgv(['add', '--target', 'claude-code,codex, cursor']);
  assert.deepEqual(flags.target, ['claude-code', 'codex', 'cursor']);
});

test('reads boolean flags without consuming the next token', () => {
  const { args, flags } = parseArgv(['add', '--dry-run', 'github:eric/x']);
  assert.equal(flags['dry-run'], true);
  assert.deepEqual(args, ['github:eric/x']);
});

test('supports short aliases', () => {
  assert.equal(parseArgv(['-h']).flags.help, true);
  assert.equal(parseArgv(['-v']).flags.version, true);
  assert.equal(parseArgv(['add', 'x', '-n', 'build']).flags.name, 'build');
});

test('reads a value flag', () => {
  assert.equal(parseArgv(['list', '--root', '/repo']).flags.root, '/repo');
});

test('rejects a value flag with no value', () => {
  assert.throws(() => parseArgv(['list', '--root']), /--root needs a value/);
});

test('rejects a value flag followed by another flag', () => {
  assert.throws(() => parseArgv(['list', '--root', '--force']), /--root needs a value/);
});

test('target defaults to an empty list so callers can fall back to the manifest', () => {
  assert.deepEqual(parseArgv(['list']).flags.target, []);
});

test('reads --method as a value flag', () => {
  assert.equal(parseArgv(['add', 'x', '--method', 'symlink']).flags.method, 'symlink');
  assert.equal(parseArgv(['add', 'x', '--method', 'copy']).flags.method, 'copy');
});

test('-a is an alias for --target', () => {
  const short = parseArgv(['add', 'x', '-a', 'claude-code']);
  const long = parseArgv(['add', 'x', '-t', 'claude-code']);
  assert.deepEqual(short.flags.target, ['claude-code']);
  assert.deepEqual(short.flags, long.flags);
});
