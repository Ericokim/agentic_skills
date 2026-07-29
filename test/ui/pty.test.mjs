// The wizard driven through a REAL pty, not a fake stream.
//
// wizard.test.mjs drives src/ui/picker.mjs and src/ui/select.mjs over a pair
// of PassThrough streams. That is enough to test the reducers and the
// rendering, but it cannot see stdin lifecycle bugs: a PassThrough has no
// `ref`/`unref` at all, and every call in this codebase is written
// `input.unref?.()` - a guarded call that is a silent no-op on a stream that
// lacks the method. A bug where step 1 unrefs stdin and step 2 never re-refs
// it is therefore invisible to that harness by construction: the fake stream
// can't tell you the process would have exited early, because on a fake
// stream there is no "the process exits early" to observe. That exact bug
// shipped and reached a user - the four step install wizard died silently
// after step 2, installing nothing, exit code 0 - and nothing in the test
// suite caught it. This file exists to make sure the next bug in this class
// gets caught here instead of by a user.
//
// Node has no built-in pty and this project takes zero dependencies, so this
// drives the CLI through the real `script` utility (present on macOS and
// Linux), which allocates an actual pty for the wrapped command. The wrinkle:
// Node's `child_process` "pipe" stdio is a Unix domain socketpair, not a
// plain pipe(2), and `script` refuses a socket for its own stdin (tcgetattr
// returns EOPNOTSUPP, not the ENOTTY it tolerates for a non-tty fd like
// /dev/null). Piping through `cat` first sidesteps this: the shell creates a
// genuine pipe(2) between `cat` and `script`, which `script` is happy with,
// while `cat` itself relays whatever Node writes to its own socket-backed
// stdin straight through. `script` still allocates a real pty for the
// wrapped `node cli.mjs` command either way, which is the part that matters:
// isTTY is true, setRawMode is the real thing, and stdin's ref/unref state is
// the real thing too.
//
// If `script` is missing, or this plumbing does not behave the way it does
// on the platform this was written against, every test below skips itself
// with a clear reason rather than failing or hanging the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI_PATH = join(REPO_ROOT, 'src', 'cli.mjs');

const KEY = {
  space: ' ',
  enter: '\r',
  escape: '\x1b',
};

// Matches every CSI escape sequence this codebase's ui/ files emit: colour
// (`m`), cursor movement (`A`), clear line (`K`), and cursor show/hide (`h`/
// `l` with a `?` parameter). Broad on purpose - this is for matching text in
// assertions, not for producing a faithful terminal replay.
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]/g;
const stripAnsi = (text) => text.replace(ANSI, '');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawn `argv` under a real pty via `script`, working around Node's
 * socketpair-based "pipe" stdio the way described at the top of this file.
 */
function spawnPty(argv, { cwd } = {}) {
  const command = argv.map(shellQuote).join(' ');
  const child = spawn('sh', ['-c', `cat | script -q /dev/null ${command}`], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  child.stdout.on('data', (chunk) => { buffer += chunk.toString(); });
  child.stderr.on('data', (chunk) => { buffer += chunk.toString(); });

  return {
    child,
    type: (text) => child.stdin.write(text),
    rendered: () => stripAnsi(buffer),
  };
}

/** Poll `rendered()` until it contains `pattern`, rather than guessing a delay. */
async function waitForOutput(rendered, pattern, { timeout = 8000, interval = 20 } = {}) {
  const start = Date.now();
  while (!pattern.test(rendered())) {
    if (Date.now() - start > timeout) {
      throw new Error(`timed out waiting for ${pattern} in the pty output:\n${rendered()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Wait for the child to exit, killing it and reporting a timeout instead of
 * hanging forever if it does not. This is what turns "the bug hangs the
 * process" into a clean, fast test failure instead of a stuck test run.
 *
 * Ends stdin first. The `cat` in `spawnPty`'s pipeline (see the file header
 * for why it is there) keeps reading for as long as our end of its input
 * stays open, and `sh -c 'cat | script ...'` does not finish until every
 * command in the pipeline has - including `cat` - even once the wrapped CLI
 * itself has long since exited. A real terminal has no such stand-in and
 * this quirk is purely a side effect of it, so every caller that is done
 * typing and ready to wait for the process must close its end first.
 */
function waitForExit(child, timeoutMs = 10000) {
  try {
    child.stdin.end();
  } catch {
    // ignore - the child may already be gone
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ code: null, signal: null, timedOut: true });
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, timedOut: false });
    });
  });
}

const atSkillsStep = (rendered) => waitForOutput(rendered, /Select skills to install/);
const atAgentsStep = (rendered) => waitForOutput(rendered, /Which agents do you want to install to\?/);
const atScopeStep = (rendered) => waitForOutput(rendered, /Installation scope/);
const atMethodStep = (rendered) => waitForOutput(rendered, /Installation method/);

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
  return mkdtemp(join(tmpdir(), 'agentic-pty-'));
}

async function sourceSkill(name) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-pty-src-'));
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), skillContents(name), 'utf8');
  return skillDir;
}

async function multiSkillSource(names) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-pty-src-'));
  for (const name of names) {
    const skillDir = join(dir, name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), skillContents(name), 'utf8');
  }
  return dir;
}

// Capability probe, run once and cached: does this platform's `script`
// actually give the wrapped command a real, writable pty through the
// `cat | script` plumbing above? If not - `script` missing, a different CLI
// with different flags, sandboxing that blocks pty allocation, whatever -
// every test below skips with this reason instead of failing or hanging.
let capability;
async function checkPtyCapability() {
  if (capability) return capability;
  capability = (async () => {
    try {
      const { child, rendered } = spawnPty(['node', '-e', 'process.stdout.write("PTY:" + process.stdin.isTTY)']);
      const result = await waitForExit(child, 5000);
      if (result.timedOut) return { ok: false, reason: 'script-based pty probe timed out' };
      if (result.code !== 0) return { ok: false, reason: `script-based pty probe exited ${result.code}` };
      if (!/PTY:true/.test(rendered())) {
        return { ok: false, reason: `script did not allocate a real pty (probe output: ${JSON.stringify(rendered())})` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `script-based pty probe threw: ${error.message}` };
    }
  })();
  return capability;
}

/** Skip `t` right now if the pty harness is not usable on this platform. */
async function requirePty(t) {
  const result = await checkPtyCapability();
  if (!result.ok) {
    t.skip(`real-pty harness unavailable: ${result.reason}`);
    return false;
  }
  return true;
}

test('the full four step wizard completes and installs, checked against files on disk', { timeout: 30000 }, async (t) => {
  if (!(await requirePty(t))) return;

  const root = await project();
  const spec = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { child, type, rendered } = spawnPty(['node', CLI_PATH, 'add', spec], { cwd: root });

  await atSkillsStep(rendered);
  type(KEY.space); // select alpha
  type(KEY.enter);

  await atAgentsStep(rendered);
  type(KEY.enter); // keep the pre-selected agent

  await atScopeStep(rendered);
  type(KEY.enter); // keep Project

  await atMethodStep(rendered);
  type(KEY.enter); // keep the default method

  const result = await waitForExit(child);

  assert.equal(result.timedOut, false, `the process hung instead of exiting after the four steps:\n${rendered()}`);
  assert.equal(result.code, 0, `expected exit code 0, got ${result.code}:\n${rendered()}`);

  const installed = await readFile(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8');
  assert.match(installed, /name: alpha/);
  await assert.rejects(() => readFile(join(root, '.claude/skills/beta/SKILL.md'), 'utf8'));
  await assert.rejects(() => readFile(join(root, '.claude/skills/gamma/SKILL.md'), 'utf8'));
});

test('pressing escape at step 2 installs nothing and exits 0', { timeout: 30000 }, async (t) => {
  if (!(await requirePty(t))) return;

  const root = await project();
  // A single-skill source skips step 1 (the picker only opens when there is
  // more than one skill to choose from), landing straight on step 2.
  const spec = await sourceSkill('build');

  const { child, type, rendered } = spawnPty(['node', CLI_PATH, 'add', spec], { cwd: root });

  await atAgentsStep(rendered);
  type(KEY.escape);

  const result = await waitForExit(child);

  assert.equal(result.timedOut, false, `the process hung instead of exiting after escape:\n${rendered()}`);
  assert.equal(result.code, 0, `expected exit code 0, got ${result.code}:\n${rendered()}`);
  await assert.rejects(() => readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8'));
});

test('the wizard does not hang: all four steps finish well inside the test timeout', { timeout: 30000 }, async (t) => {
  if (!(await requirePty(t))) return;

  const root = await project();
  const spec = await sourceSkill('build');

  const { child, type, rendered } = spawnPty(['node', CLI_PATH, 'add', spec], { cwd: root });

  const start = Date.now();

  await atAgentsStep(rendered);
  type(KEY.enter);

  await atScopeStep(rendered);
  type(KEY.enter);

  await atMethodStep(rendered);
  type(KEY.enter);

  const result = await waitForExit(child, 15000);
  const elapsed = Date.now() - start;

  assert.equal(result.timedOut, false, `the process hung instead of exiting:\n${rendered()}`);
  assert.equal(result.code, 0);
  // Generous relative to how long the four steps take to type and render
  // (well under a second in practice); this is a hang guard, not a
  // performance benchmark.
  assert.ok(elapsed < 15000, `wizard took ${elapsed}ms, expected well under 15000ms`);
});
