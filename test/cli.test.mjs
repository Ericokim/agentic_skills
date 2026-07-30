import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main, parseArgv } from '../src/cli.mjs';
import { captureOutput } from './.capture-output.mjs';

test('separates the command from its arguments', () => {
  const { command, args } = parseArgv(['validate', 'skills/']);
  assert.equal(command, 'validate');
  assert.deepEqual(args, ['skills/']);
});

test('returns a null command for no arguments', () => {
  assert.equal(parseArgv([]).command, null);
});

test('reads boolean flags without consuming the next token', () => {
  const { args, flags } = parseArgv(['build', '--check', 'skills/']);
  assert.equal(flags.check, true);
  assert.deepEqual(args, ['skills/']);
});

test('supports short aliases', () => {
  assert.equal(parseArgv(['-h']).flags.help, true);
  assert.equal(parseArgv(['-v']).flags.version, true);
});

test('reads a value flag', () => {
  assert.equal(parseArgv(['validate', '--root', '/repo']).flags.root, '/repo');
});

test('rejects a value flag with no value', () => {
  assert.throws(() => parseArgv(['validate', '--root']), /--root needs a value/);
});

test('rejects a value flag followed by another flag', () => {
  assert.throws(() => parseArgv(['validate', '--root', '--check']), /--root needs a value/);
});

test('reads --answers as a value flag', () => {
  assert.equal(parseArgv(['context', '--answers', 'a.json']).flags.answers, 'a.json');
});

// Installing is rented from the skills CLI. Someone typing `agentic add` has
// read a README, so the useful answer is the command that works rather than a
// bare "unknown command".

test('a rented command names the skills CLI command to run instead', async () => {
  for (const command of ['add', 'init', 'update', 'remove', 'list', 'ls', 'rm', 'install']) {
    const { result, output } = await captureOutput(() => main([command, 'x']));
    assert.equal(result, 2, `${command} should exit 2`);
    assert.match(output, /skills@latest/, `${command} should point at the skills CLI`);
  }
});

test('add points at add, remove at remove, list at list', async () => {
  const said = async (command) => (await captureOutput(() => main([command]))).output;
  assert.match(await said('add'), /skills@latest add Ericokim\/agentic_skills/);
  assert.match(await said('remove'), /skills@latest remove/);
  assert.match(await said('list'), /skills@latest list/);
});

test('an unknown command is still an unknown command', async () => {
  // The reason goes to stderr via fail(); captureOutput takes stdout, so the
  // assertion is on the exit code and on not being given install advice for a
  // command that has nothing to do with installing.
  const { result, output } = await captureOutput(() => main(['frobnicate']));
  assert.equal(result, 2);
  assert.match(output, /run agentic --help for the list/);
  assert.doesNotMatch(output, /skills@latest/);
});

test('the usage text leads with how to install, since that is what most readers want', async () => {
  const { result, output } = await captureOutput(() => main(['--help']));
  assert.equal(result, 0);
  assert.match(output, /INSTALLING THESE SKILLS/);
  assert.match(output, /npx -y skills@latest add Ericokim\/agentic_skills/);
  assert.ok(
    output.indexOf('INSTALLING THESE SKILLS') < output.indexOf('COMMANDS'),
    'installing should come before the command list',
  );
});

test('no arguments prints usage and exits non zero', async () => {
  const { result, output } = await captureOutput(() => main([]));
  assert.equal(result, 1);
  assert.match(output, /USAGE/);
});
