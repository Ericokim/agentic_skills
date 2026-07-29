// The wizard, driven the way a person actually drives it: keys arrive one at
// a time on a fake terminal, and the assertions look at what landed on disk,
// not at the reducer state a unit test would poke directly.
//
// select-state.test.mjs and picker-state.test.mjs already cover the reducers
// in isolation. What is missing - and what this file is for - is the seam
// between them and add(): does pressing the keys a person would actually
// press, through the real terminal loop in src/ui/select.mjs and
// src/ui/picker.mjs, produce the filesystem result a person would expect.
//
// The fake terminal is a pair of PassThrough streams. `isTTY` and
// `setRawMode` are stubbed so pickOne/pickSkills treat them as a real
// terminal; readline's own keypress decoding does the rest; typing a
// sequence into `input` is exactly what a real keystroke looks like to that
// decoder, whether or not anything is listening yet - a picker's whole setup
// (attaching listeners, rendering the first frame) runs synchronously before
// its promise is even returned, so writing a step's keys only after that
// step's frame has appeared in `output` is always safe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { add } from '../../src/commands/add.mjs';
import { readManifest } from '../../src/manifest.mjs';
import { __resetOutputClosedForTest } from '../../src/ui.mjs';
import { captureOutput } from '../.capture-output.mjs';

const KEY = {
  up: '\x1b[A',
  down: '\x1b[B',
  space: ' ',
  enter: '\r',
  escape: '\x1b',
};

function skillContents(name) {
  return `---
name: ${name}
description: Builds a feature from its spec.
allowed-tools: Read, Write, Bash, Agent
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: independent
  done: checklist
---

## What this skill does

Builds the thing.
`;
}

async function project() {
  return mkdtemp(join(tmpdir(), 'agentic-wizard-'));
}

async function sourceSkill(name) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-wsrc-'));
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), skillContents(name), 'utf8');
  return skillDir;
}

/** A source directory holding several skills, laid out at its top level. */
async function multiSkillSource(names) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-wsrc-'));
  for (const name of names) {
    const skillDir = join(dir, name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), skillContents(name), 'utf8');
  }
  return dir;
}

/**
 * A fake terminal: a writable `input` a test types keys into, and a readable
 * `output` a test can inspect, both flagged as TTYs so pickOne/pickSkills run
 * their real interactive loop instead of the off-TTY no-op.
 */
function fakeTTY() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};

  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 80;

  let buffer = '';
  output.on('data', (chunk) => {
    buffer += chunk.toString();
  });

  return { input, output, rendered: () => buffer };
}

/** Poll `rendered()` until it contains `pattern`, rather than guessing a delay. */
async function waitForOutput(rendered, pattern, { timeout = 3000, interval = 5 } = {}) {
  const start = Date.now();
  while (!pattern.test(rendered())) {
    if (Date.now() - start > timeout) {
      throw new Error(`timed out waiting for ${pattern} in the rendered wizard output:\n${rendered()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

const atSkillsStep = (rendered) => waitForOutput(rendered, /Select skills to install/);
const atAgentsStep = (rendered) => waitForOutput(rendered, /Which agents do you want to install to\?/);
const atScopeStep = (rendered) => waitForOutput(rendered, /Installation scope/);
const atMethodStep = (rendered) => waitForOutput(rendered, /Installation method/);

/** Base options every wizard run in this file shares. */
function base({ root, spec, input, output, ...rest }) {
  return {
    root,
    spec,
    name: null,
    only: null,
    targets: [],
    cacheDir: tmpdir(),
    dryRun: false,
    force: false,
    cwd: root,
    interactive: true,
    input,
    output,
    ...rest,
  };
}

test.afterEach(() => __resetOutputClosedForTest());

test('a user arrows down twice, selects one skill with space, and presses enter: only that skill installs', async () => {
  const root = await project();
  const spec = await multiSkillSource(['alpha', 'beta', 'gamma']);
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));

    await atSkillsStep(rendered);
    input.write(KEY.down); // alpha -> beta
    input.write(KEY.down); // beta -> gamma
    input.write(KEY.space); // select gamma
    input.write(KEY.enter);

    await atAgentsStep(rendered);
    input.write(KEY.enter); // keep the pre-selected agent

    await atScopeStep(rendered);
    input.write(KEY.enter); // keep Project

    await atMethodStep(rendered);
    input.write(KEY.enter); // keep the default method

    return done;
  });

  assert.equal(code, 0);
  await readFile(join(root, '.claude/skills/gamma/SKILL.md'), 'utf8');
  await assert.rejects(() => readFile(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8'));
  await assert.rejects(() => readFile(join(root, '.claude/skills/beta/SKILL.md'), 'utf8'));
});

test('a user types "dev" to filter, selects with space, and presses enter: exactly the develop skill installs', async () => {
  const root = await project();
  const spec = await multiSkillSource(['alpha', 'develop', 'beta']);
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));

    await atSkillsStep(rendered);
    input.write('d');
    input.write('e');
    input.write('v');
    input.write(KEY.space);
    input.write(KEY.enter);

    await atAgentsStep(rendered);
    input.write(KEY.enter);

    await atScopeStep(rendered);
    input.write(KEY.enter);

    await atMethodStep(rendered);
    input.write(KEY.enter);

    return done;
  });

  assert.equal(code, 0);
  await readFile(join(root, '.claude/skills/develop/SKILL.md'), 'utf8');
  await assert.rejects(() => readFile(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8'));
  await assert.rejects(() => readFile(join(root, '.claude/skills/beta/SKILL.md'), 'utf8'));
});

test('a user selects three skills with space, and all three install', async () => {
  const root = await project();
  const spec = await multiSkillSource(['alpha', 'beta', 'gamma']);
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));

    await atSkillsStep(rendered);
    input.write(KEY.space); // select alpha
    input.write(KEY.down);
    input.write(KEY.space); // select beta
    input.write(KEY.down);
    input.write(KEY.space); // select gamma
    input.write(KEY.enter);

    await atAgentsStep(rendered);
    input.write(KEY.enter);

    await atScopeStep(rendered);
    input.write(KEY.enter);

    await atMethodStep(rendered);
    input.write(KEY.enter);

    return done;
  });

  assert.equal(code, 0);
  for (const name of ['alpha', 'beta', 'gamma']) {
    await readFile(join(root, `.claude/skills/${name}/SKILL.md`), 'utf8');
  }
});

test('a user presses enter at the agents step without changing anything: the pre-selected detected agent is used', async () => {
  const root = await project();
  const spec = await sourceSkill('build');
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));

    // No .claude, .cursor, or any other agent directory exists yet, so
    // detection falls back to claude-code - the default this step
    // pre-selects. Pressing enter immediately must keep exactly that.
    await atAgentsStep(rendered);
    input.write(KEY.enter);

    await atScopeStep(rendered);
    input.write(KEY.enter);

    await atMethodStep(rendered);
    input.write(KEY.enter);

    return done;
  });

  assert.equal(code, 0);
  await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');
});

test('a user chooses Global at the scope step: files land under the injected home directory, not the project', async () => {
  const root = await project();
  const home = await mkdtemp(join(tmpdir(), 'agentic-wizard-home-'));
  const spec = await sourceSkill('build');
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output, home }));

    await atAgentsStep(rendered);
    input.write(KEY.enter);

    await atScopeStep(rendered);
    input.write(KEY.down); // Project -> Global
    input.write(KEY.enter);

    await atMethodStep(rendered);
    input.write(KEY.enter);

    return done;
  });

  assert.equal(code, 0);
  await readFile(join(home, '.claude/skills/build/SKILL.md'), 'utf8');
  await assert.rejects(() => readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8'));
  await assert.rejects(() => readdir(join(root, '.claude')));
});

test('a user chooses Symlink at the method step: the agent directory is a symlink, and the canonical directory holds the real file', async () => {
  const root = await project();
  const spec = await sourceSkill('build');
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));

    await atAgentsStep(rendered);
    input.write(KEY.enter);

    await atScopeStep(rendered);
    input.write(KEY.enter);

    await atMethodStep(rendered);
    input.write(KEY.enter); // Symlink is first, and the default

    return done;
  });

  assert.equal(code, 0);

  const linkStat = await lstat(join(root, '.claude/skills/build'));
  assert.ok(linkStat.isSymbolicLink(), 'the agent directory should be a symlink');

  const canonicalStat = await lstat(join(root, '.agentic/skills/build/SKILL.md'));
  assert.ok(canonicalStat.isFile(), 'the canonical directory should hold the real file');
  assert.ok(!canonicalStat.isSymbolicLink());
});

test('a user chooses Copy at the method step: the agent directory holds a real file, with no symlink anywhere', async () => {
  const root = await project();
  const spec = await sourceSkill('build');
  const { input, output, rendered } = fakeTTY();

  const { result: code } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));

    await atAgentsStep(rendered);
    input.write(KEY.enter);

    await atScopeStep(rendered);
    input.write(KEY.enter);

    await atMethodStep(rendered);
    input.write(KEY.down); // Symlink -> Copy to all agents
    input.write(KEY.enter);

    return done;
  });

  assert.equal(code, 0);

  const dirStat = await lstat(join(root, '.claude/skills/build'));
  assert.ok(dirStat.isDirectory());
  assert.ok(!dirStat.isSymbolicLink());

  const fileStat = await lstat(join(root, '.claude/skills/build/SKILL.md'));
  assert.ok(fileStat.isFile());
  assert.ok(!fileStat.isSymbolicLink());

  await assert.rejects(() => lstat(join(root, '.agentic/skills/build')));
});

test('a user presses escape at each of the four steps in turn: nothing is written, and the exit code is 0', async () => {
  // Step 1: the skills step, only reachable with a multi-skill source.
  {
    const root = await project();
    const spec = await multiSkillSource(['alpha', 'beta', 'gamma']);
    const { input, output, rendered } = fakeTTY();

    const { result: code } = await captureOutput(async () => {
      const done = add(base({ root, spec, input, output }));
      await atSkillsStep(rendered);
      input.write(KEY.escape);
      return done;
    });

    assert.equal(code, 0);
    const manifest = await readManifest(root);
    assert.deepEqual(manifest.skills, {});
    await assert.rejects(() => readdir(join(root, '.claude')));
  }

  // Step 2: the agents step.
  {
    const root = await project();
    const spec = await sourceSkill('build');
    const { input, output, rendered } = fakeTTY();

    const { result: code } = await captureOutput(async () => {
      const done = add(base({ root, spec, input, output }));
      await atAgentsStep(rendered);
      input.write(KEY.escape);
      return done;
    });

    assert.equal(code, 0);
    const manifest = await readManifest(root);
    assert.deepEqual(manifest.skills, {});
    await assert.rejects(() => readdir(join(root, '.claude')));
  }

  // Step 3: the scope step.
  {
    const root = await project();
    const spec = await sourceSkill('build');
    const { input, output, rendered } = fakeTTY();

    const { result: code } = await captureOutput(async () => {
      const done = add(base({ root, spec, input, output }));
      await atAgentsStep(rendered);
      input.write(KEY.enter);
      await atScopeStep(rendered);
      input.write(KEY.escape);
      return done;
    });

    assert.equal(code, 0);
    const manifest = await readManifest(root);
    assert.deepEqual(manifest.skills, {});
    await assert.rejects(() => readdir(join(root, '.claude')));
  }

  // Step 4: the method step.
  {
    const root = await project();
    const spec = await sourceSkill('build');
    const { input, output, rendered } = fakeTTY();

    const { result: code } = await captureOutput(async () => {
      const done = add(base({ root, spec, input, output }));
      await atAgentsStep(rendered);
      input.write(KEY.enter);
      await atScopeStep(rendered);
      input.write(KEY.enter);
      await atMethodStep(rendered);
      input.write(KEY.escape);
      return done;
    });

    assert.equal(code, 0);
    const manifest = await readManifest(root);
    assert.deepEqual(manifest.skills, {});
    await assert.rejects(() => readdir(join(root, '.claude')));
    await assert.rejects(() => readdir(join(root, '.agentic')));
  }
});

test('a user selects nothing at the skills step and presses enter: the run cancels rather than installing nothing silently', async () => {
  const root = await project();
  const spec = await multiSkillSource(['alpha', 'beta', 'gamma']);
  const { input, output, rendered } = fakeTTY();

  const { result: code, output: printed } = await captureOutput(async () => {
    const done = add(base({ root, spec, input, output }));
    await atSkillsStep(rendered);
    input.write(KEY.enter); // nothing selected
    return done;
  });

  assert.equal(code, 0);
  assert.match(printed, /cancelled/);
  const manifest = await readManifest(root);
  assert.deepEqual(manifest.skills, {});
  await assert.rejects(() => readdir(join(root, '.claude')));
});
