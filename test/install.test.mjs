// End to end: the pipeline against a real filesystem.
//
// Everything else in this suite is pure and runs without touching disk. These
// tests exist because the seams between the pure core and the world (writing
// files, detecting drift, refusing to clobber) are exactly where the pure tests
// cannot reach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { add, defaultSourceFromPackage, resolveDefaultSource } from '../src/commands/add.mjs';
import { init } from '../src/commands/init.mjs';
import { list } from '../src/commands/list.mjs';
import { remove } from '../src/commands/remove.mjs';
import { commitInstall, detectDrift, discoverSkills, locateSkill, prepareInstall } from '../src/install.mjs';
import { readLock, writeLock } from '../src/lock.mjs';
import { defaultManifest, writeManifest } from '../src/manifest.mjs';
import { __resetOutputClosedForTest } from '../src/ui.mjs';
import { captureOutput } from './.capture-output.mjs';

const GOOD = `---
name: build
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

const INCOHERENT = GOOD.replace('evidence: strict', 'evidence: off');

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  await writeManifest(root, defaultManifest({ targets: ['claude-code'] }));
  return root;
}

async function sourceSkill(name, contents) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), contents, 'utf8');
  return skillDir;
}

const runGit = promisify(execFile);

/**
 * A real local git repository, tagged v1.0.0, holding several skills under
 * skills/. Standing in for a git+file source so a multi-skill install can be
 * proven to keep recording it as one, rather than the resolved cache path.
 */
async function taggedGitSource(names) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-gitsrc-'));
  for (const name of names) {
    const skillDir = join(dir, 'skills', name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), GOOD.replace('name: build', `name: ${name}`), 'utf8');
  }
  await runGit('git', ['init'], { cwd: dir });
  await runGit('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await runGit('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await runGit('git', ['add', '.'], { cwd: dir });
  await runGit('git', ['commit', '-m', 'initial'], { cwd: dir });
  await runGit('git', ['tag', 'v1.0.0'], { cwd: dir });
  return dir;
}

/** A source directory holding several skills, laid out at its top level. */
async function multiSkillSource(names) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  for (const name of names) {
    const skillDir = join(dir, name);
    await mkdir(skillDir, { recursive: true });
    // The standard requires a skill's frontmatter name to match its
    // directory, so each one needs its own copy of GOOD rather than sharing
    // "build" across every directory.
    await writeFile(join(skillDir, 'SKILL.md'), GOOD.replace('name: build', `name: ${name}`), 'utf8');
  }
  return dir;
}

const install = (root, spec) =>
  prepareInstall({ root, name: null, spec, targets: ['claude-code'], cwd: root });

test('installs a compiled skill with the standard injected', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const prepared = await install(root, spec);
  assert.deepEqual(prepared.violations, []);
  await commitInstall({ root, ...prepared });

  const installed = await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');
  assert.match(installed, /## Evidence classification/);
  assert.match(installed, /## Definition of done/);
  assert.doesNotMatch(installed.split('---')[1], /standard:/);
});

test('a skill that fails the standard plans no files at all', async () => {
  const root = await project();
  const spec = await sourceSkill('build', INCOHERENT);

  const prepared = await install(root, spec);
  assert.ok(prepared.violations.some((v) => v.severity === 'error'));
  assert.deepEqual(prepared.files, []);
  assert.equal(prepared.compiled, null);

  // Nothing was written, so the project is untouched.
  assert.deepEqual(await readdir(root), ['skills.json']);
});

test('detects a hand edited installed file', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await install(root, spec);
  const { entry } = await commitInstall({ root, ...prepared });

  assert.deepEqual(await detectDrift(root, entry), []);

  const path = join(root, '.claude/skills/build/SKILL.md');
  await writeFile(path, `${await readFile(path, 'utf8')}\nedited by a person\n`, 'utf8');

  const drift = await detectDrift(root, entry);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].reason, 'edited');
});

test('detects a deleted installed file', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await install(root, spec);
  const { entry } = await commitInstall({ root, ...prepared });

  await writeLock(root, { build: entry });
  entry.files['.claude/skills/build/GONE.md'] = 'sha256-whatever';

  const drift = await detectDrift(root, entry);
  assert.ok(drift.some((d) => d.reason === 'missing'));
});

test('the lock entry records the source, standard, and a hash per file', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await install(root, spec);
  const { entry } = await commitInstall({ root, ...prepared });
  await writeLock(root, { build: entry });

  const lock = await readLock(root);
  assert.equal(lock.build.standard, '1.0.0');
  assert.match(lock.build.resolved, /build$/);
  assert.deepEqual(Object.keys(lock.build.files), ['.claude/skills/build/SKILL.md']);
  assert.match(lock.build.files['.claude/skills/build/SKILL.md'], /^sha256-/);
});

test('installing to several targets writes each one', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);
  const prepared = await prepareInstall({
    root,
    name: null,
    spec,
    targets: ['claude-code', 'codex', 'cursor'],
    cwd: root,
  });
  await commitInstall({ root, ...prepared });

  for (const relative of [
    '.claude/skills/build/SKILL.md',
    '.agents/skills/build/SKILL.md',
    '.agents/skills/build/agents/openai.yaml',
    '.cursor/rules/build.mdc',
  ]) {
    await readFile(join(root, relative), 'utf8');
  }
});

test('symlink round trip: editing the canonical file is detected as drift, and remove cleans up both the links and the canonical directory', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const { result: code } = await captureOutput(() =>
    add({
      root,
      spec,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
      method: 'symlink',
    }),
  );
  assert.equal(code, 0);

  const linkPath = join(root, '.claude/skills/build');
  const canonicalDir = join(root, '.agentic/skills/build');
  const canonicalSkill = join(canonicalDir, 'SKILL.md');

  assert.ok((await lstat(linkPath)).isSymbolicLink(), 'the agent directory should be a symlink');
  assert.ok((await lstat(canonicalSkill)).isFile(), 'the canonical directory should hold the real file');
  // Reading through the link resolves to the canonical file's own bytes.
  assert.equal(await readFile(join(linkPath, 'SKILL.md'), 'utf8'), await readFile(canonicalSkill, 'utf8'));

  await writeFile(canonicalSkill, `${await readFile(canonicalSkill, 'utf8')}\nedited by a person\n`, 'utf8');

  const { result: listCode, output } = await captureOutput(() => list({ root }));
  assert.equal(listCode, 1);
  assert.match(output, /edited by hand/);

  const { result: removeCode } = await captureOutput(() => remove({ root, name: 'build' }));
  assert.equal(removeCode, 0);

  await assert.rejects(() => lstat(linkPath), 'the symlink should be gone');
  await assert.rejects(() => lstat(canonicalDir), 'the canonical directory should be gone');
});

test('locateSkill names what a source actually contains when the skill is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  await mkdir(join(dir, 'skills', 'audit'), { recursive: true });
  await writeFile(join(dir, 'skills', 'audit', 'SKILL.md'), GOOD, 'utf8');

  await assert.rejects(
    () => locateSkill(dir, 'nope'),
    (error) => {
      assert.match(error.message, /nope/);
      assert.match(error.message, /audit/);
      return true;
    },
  );
});

test('installing every skill in this repo succeeds, and installing the result again is a fixpoint', async () => {
  // skills/ is the one directory: what a person authors and what this tool's
  // own `add` (or any third party installer) finds when this repo is the
  // source. Two properties matter and neither is provable at compile() alone.
  //
  // Installing it must strip the declaration and inject the blocks once. Then
  // installing that output must be a no op, because a source that declares
  // nothing has nothing to inject, which is what stops a skill picking up a
  // second copy of every block each time it passes through a tool.
  const root = await project();
  const again = await project();
  const repo = new URL('..', import.meta.url).pathname;

  const entries = await readdir(join(repo, 'skills'), { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.equal(names.length, 9, 'expected the nine workflow skills');

  for (const name of names) {
    const prepared = await install(root, join(repo, 'skills', name));
    assert.deepEqual(
      prepared.violations.filter((v) => v.severity === 'error'),
      [],
      `${name} failed the standard`,
    );
    await commitInstall({ root, ...prepared });

    const installed = await readFile(join(root, `.claude/skills/${name}/SKILL.md`), 'utf8');
    assert.match(installed, /## Definition of done/, `${name} lost its definition of done`);
    assert.doesNotMatch(
      installed.split('---')[1],
      /standard:/,
      `${name} shipped its compile time declaration`,
    );
    assert.equal(
      installed.match(/<!-- agentic:standard /g).length,
      2,
      `${name} has more than the two injected regions`,
    );

    const round = await install(again, join(root, '.claude/skills', name));
    assert.deepEqual(
      round.violations.filter((v) => v.severity === 'error'),
      [],
      `${name} was rejected when reinstalled from its own installed form`,
    );
    assert.equal(round.compiled, installed, `${name} changed on a second pass`);
  }
});

test('selecting two targets that share a path plans that file once', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const prepared = await prepareInstall({
    root,
    name: null,
    spec,
    targets: ['codex', 'generic'], // both write .agents/skills/build/SKILL.md
    cwd: root,
  });

  const paths = prepared.files.map((f) => f.path);
  assert.deepEqual(paths, [...new Set(paths)], `duplicate planned paths: ${paths.join(', ')}`);
  assert.equal(paths.filter((p) => p.endsWith('.agents/skills/build/SKILL.md')).length, 1);
  assert.ok(paths.some((p) => p.endsWith('agents/openai.yaml')), 'codex adapter should survive');
});

test('discoverSkills finds many skills nested under skills/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  await mkdir(join(dir, 'skills', 'audit'), { recursive: true });
  await mkdir(join(dir, 'skills', 'build'), { recursive: true });
  await writeFile(join(dir, 'skills', 'audit', 'SKILL.md'), GOOD, 'utf8');
  await writeFile(join(dir, 'skills', 'build', 'SKILL.md'), GOOD, 'utf8');

  const found = await discoverSkills(dir);
  assert.deepEqual(found.map((s) => s.name), ['audit', 'build']);
  assert.equal(found[0].path, join(dir, 'skills', 'audit'));
  assert.equal(found[1].path, join(dir, 'skills', 'build'));
});

test('discoverSkills finds many skills at the top level', async () => {
  const dir = await multiSkillSource(['zebra', 'audit', 'build']);

  const found = await discoverSkills(dir);
  assert.deepEqual(found.map((s) => s.name), ['audit', 'build', 'zebra']);
  assert.equal(found[0].path, join(dir, 'audit'));
});

test('discoverSkills returns nothing for a source with exactly one skill at its root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));
  await writeFile(join(dir, 'SKILL.md'), GOOD, 'utf8');

  assert.deepEqual(await discoverSkills(dir), []);
});

test('discoverSkills returns nothing for a source with no skills at all', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-src-'));

  assert.deepEqual(await discoverSkills(dir), []);
});

test('add installs every skill from a multi-skill source when no name is given', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  assert.match(output, /Found 3 skills/);
  assert.match(output, /3 skills installed, 0 failed/);

  for (const name of ['alpha', 'beta', 'gamma']) {
    await readFile(join(root, `.claude/skills/${name}/SKILL.md`), 'utf8');
  }

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills).sort(), ['alpha', 'beta', 'gamma']);
});

// This is the regression that matters: piping `agentic add` into `head` (or
// anything else that closes the read end early) must not abandon an install
// half finished. The old handler in cli.mjs called process.exit(0) the
// instant stdout raised EPIPE, which could fire mid-loop and skip the
// manifest and lockfile writes that happen after it. Here nothing ever reads
// stdout at all: every write throws EPIPE synchronously, from the very first
// one, standing in for a pipe that is closed before the install even starts.
test('installing a multi-skill source completes and records every skill even though stdout throws EPIPE on every write', async () => {
  const root = await project();
  const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  const src = await multiSkillSource(names);

  const originalWrite = process.stdout.write.bind(process.stdout);
  let writeAttempts = 0;
  process.stdout.write = () => {
    writeAttempts += 1;
    const error = new Error('EPIPE');
    error.code = 'EPIPE';
    throw error;
  };

  // Deliberately NOT captureOutput here: this test needs its own mock, one
  // that throws on every write rather than collecting it, and captureOutput
  // would only get in the way - installed second, it would swap
  // process.stdout.write again and silently replace the throwing mock with
  // a plain collector, which is exactly what happened the one time this was
  // tried (writeAttempts stayed 0 and the test's own assertion caught it).
  // The mock below already throws before any byte reaches the real stdout,
  // so the hazard captureOutput exists for cannot occur here regardless.
  let code;
  try {
    code = await add({
      root,
      spec: src,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    });
  } finally {
    process.stdout.write = originalWrite;
    // outputClosed is module state in src/ui.mjs, shared by every test in
    // this process. Without resetting it here, every test that runs after
    // this one in this file would find output already silenced.
    __resetOutputClosedForTest();
  }

  assert.equal(code, 0);
  assert.ok(writeAttempts >= 1, 'the mock must actually have been exercised by at least one write');

  for (const name of names) {
    await readFile(join(root, `.claude/skills/${name}/SKILL.md`), 'utf8');
  }

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills).sort(), [...names].sort());
});

test('add never opens the picker unless the caller asks for it', async () => {
  const root = await project();
  const source = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code } = await captureOutput(() =>
    add({
      root,
      spec: source,
      name: null,
      only: null,
      all: false,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
      // interactive deliberately omitted: add() must default it to false
      // rather than reading process.stdin/process.stdout itself, or this
      // test would block waiting for a keypress on a real terminal.
    }),
  );

  assert.equal(code, 0);
  // Every skill installed, nothing waited for input.
  assert.equal((await readdir(join(root, '.claude/skills'))).length, 3);
});

test('add --only installs just the requested subset of a multi-skill source', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code } = await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: 'alpha,gamma',
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  await readFile(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8');
  await readFile(join(root, '.claude/skills/gamma/SKILL.md'), 'utf8');
  await assert.rejects(() => readFile(join(root, '.claude/skills/beta/SKILL.md'), 'utf8'));

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills).sort(), ['alpha', 'gamma']);
});

test('add --only reports the count actually installed, not the source total', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: 'alpha,gamma',
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  // Two skills installed, out of three the source provides: the found count
  // and the installed count must not be conflated.
  assert.doesNotMatch(output, /Found 3 skills/);
  assert.match(output, /Found 2 skills/);
  assert.match(output, /3 available/);
  assert.match(output, /2 skills installed, 0 failed/);
});

test('add --only with an unknown name errors and names what the source does provide', async () => {
  const root = await project();
  const src = await multiSkillSource(['alpha', 'beta', 'gamma']);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: 'nope',
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 1);
  assert.match(output, /nope/);
  assert.match(output, /alpha/);
  assert.match(output, /beta/);
  assert.match(output, /gamma/);

  // Nothing was written: an unknown --only name refuses the whole install.
  assert.deepEqual(await readdir(root), ['skills.json']);
});

test('add still installs a single-skill source exactly as before', async () => {
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  assert.doesNotMatch(output, /Found \d+ skills/);
  await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');
});

test('add --all from a tagged git source records the git spec and ref, not the resolved cache path', async () => {
  const root = await project();
  const cacheDir = await mkdtemp(join(tmpdir(), 'agentic-cache-'));
  const gitSource = await taggedGitSource(['audit', 'scope']);

  const { result: code } = await captureOutput(() =>
    add({
      root,
      spec: `git+file://${gitSource}#v1.0.0`,
      name: null,
      only: null,
      all: true,
      targets: ['claude-code'],
      cacheDir,
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  for (const name of ['audit', 'scope']) {
    const spec = manifest.skills[name];
    assert.match(spec, /^git\+/, `${name}'s recorded spec should start with git+, got ${spec}`);
    assert.match(spec, /#v1\.0\.0$/, `${name}'s recorded spec should keep the pinned ref, got ${spec}`);
    assert.doesNotMatch(spec, /\.cache\/agentic/, `${name}'s recorded spec must not be a resolver cache path`);
  }

  const lock = JSON.parse(await readFile(join(root, 'skills.lock'), 'utf8'));
  assert.ok(lock.audit.sha, 'audit should have a resolved commit sha');
  assert.ok(lock.scope.sha, 'scope should have a resolved commit sha');
});

test('add creates skills.json when there is none, rather than erroring', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  const spec = await sourceSkill('build', GOOD);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec,
      name: null,
      only: null,
      targets: [],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  assert.match(output, /wrote skills\.json/);
  await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills), ['build']);
});

test('the manifest add creates records the detected targets, and -a overrides detection', async () => {
  const detectedRoot = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  await mkdir(join(detectedRoot, '.cursor'), { recursive: true });
  const spec = await sourceSkill('build', GOOD);

  await captureOutput(() =>
    add({
      root: detectedRoot,
      spec,
      name: null,
      only: null,
      targets: [],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: detectedRoot,
    }),
  );

  const detectedManifest = JSON.parse(await readFile(join(detectedRoot, 'skills.json'), 'utf8'));
  assert.deepEqual(detectedManifest.targets, ['cursor']);

  const overrideRoot = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  await mkdir(join(overrideRoot, '.cursor'), { recursive: true }); // would detect cursor, but -a wins
  const overrideSpec = await sourceSkill('build', GOOD);

  await captureOutput(() =>
    add({
      root: overrideRoot,
      spec: overrideSpec,
      name: null,
      only: null,
      targets: ['codex'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: overrideRoot,
    }),
  );

  const overrideManifest = JSON.parse(await readFile(join(overrideRoot, 'skills.json'), 'utf8'));
  assert.deepEqual(overrideManifest.targets, ['codex']);
  await readFile(join(overrideRoot, '.agents/skills/build/SKILL.md'), 'utf8');
});

test('defaultSourceFromPackage pins a github repository.url to the given version', () => {
  assert.equal(
    defaultSourceFromPackage({
      repository: { url: 'git+https://github.com/Ericokim/agentic_skills.git' },
      version: '0.2.0',
    }),
    'github:Ericokim/agentic_skills#v0.2.0',
  );
});

test('defaultSourceFromPackage returns null rather than guessing when there is no usable repository', () => {
  assert.equal(defaultSourceFromPackage({ version: '0.2.0' }), null);
  assert.equal(
    defaultSourceFromPackage({ repository: { url: 'https://gitlab.com/eric/x.git' }, version: '0.2.0' }),
    null,
  );
});

test('add with no source and an empty manifest resolves the default source from this package.json, pinned to the running version', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const expected = `github:Ericokim/agentic_skills#v${pkg.version}`;

  assert.equal(await resolveDefaultSource(), expected);
});

test('add with no source and a non-empty manifest installs those entries, not the default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  const spec = await sourceSkill('build', GOOD);
  const manifest = defaultManifest({ targets: ['claude-code'] });
  manifest.skills = { build: spec };
  await writeManifest(root, manifest);

  const { result: code, output } = await captureOutput(() =>
    add({
      root,
      spec: null,
      name: null,
      only: null,
      targets: [],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(code, 0);
  assert.doesNotMatch(output, /installing this tool's own skills/);
  await readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8');
});

test('a global-scope install writes skills under the injected home and the manifest under <home>/.agentic, and writes nothing into the project directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));
  const home = await mkdtemp(join(tmpdir(), 'agentic-home-'));
  const spec = await sourceSkill('build', GOOD);

  const { result: code } = await captureOutput(() =>
    add({
      root,
      spec,
      name: null,
      only: null,
      targets: ['claude-code'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
      global: true,
      home,
      // interactive omitted: this is a non-interactive, scripted global
      // install (what --global is for off a TTY), so the wizard must never
      // run and never block on a keypress.
    }),
  );

  assert.equal(code, 0);

  // The skill itself lands under the home directory, not the project.
  await readFile(join(home, '.claude/skills/build/SKILL.md'), 'utf8');
  await assert.rejects(() => readFile(join(root, '.claude/skills/build/SKILL.md'), 'utf8'));

  // The manifest and lockfile are tracked under <home>/.agentic, not mixed
  // into the home directory's root and not written into the project.
  const manifest = JSON.parse(await readFile(join(home, '.agentic/skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.skills), ['build']);
  await readFile(join(home, '.agentic/skills.lock'), 'utf8');

  // Nothing at all was written into the project directory.
  assert.deepEqual(await readdir(root), []);
});

test('init still creates skills.json, detecting targets, exactly as before', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-e2e-'));

  const { result: code, output } = await captureOutput(() => init({ root, targets: [] }));

  assert.equal(code, 0);
  assert.match(output, /wrote skills\.json/);
  assert.match(output, /targets: claude-code/);
  assert.match(output, /next: agentic add/);

  const manifest = JSON.parse(await readFile(join(root, 'skills.json'), 'utf8'));
  assert.deepEqual(manifest, defaultManifest({ targets: ['claude-code'] }));
});

test('init still refuses to overwrite an existing manifest', async () => {
  const root = await project();

  const { result: code, output } = await captureOutput(() => init({ root, targets: [] }));

  assert.equal(code, 0);
  assert.match(output, /already exists/);
});

test('installing a multi-skill source never touches an existing AGENTS.md', async () => {
  const root = await project();
  const agentsContents = '# Custom agent instructions\n\nDo not touch this file.\n';
  await writeFile(join(root, 'AGENTS.md'), agentsContents, 'utf8');

  const src = await multiSkillSource(['alpha', 'beta']);
  await captureOutput(() =>
    add({
      root,
      spec: src,
      name: null,
      only: null,
      targets: ['claude-code', 'codex'],
      cacheDir: tmpdir(),
      dryRun: false,
      force: false,
      cwd: root,
    }),
  );

  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), agentsContents);
});

test('re-running add with no source keeps the method the skill was installed with', async () => {
  // The restore path: a teammate clones a repo carrying skills.json, skills.lock
  // and the committed canonical directory, then runs `add` with no arguments.
  // That must not silently reshape the install. Defaulting to copy here turned a
  // symlink install into nine copies, rewrote the lockfile to say so, and left
  // every canonical file orphaned, all reported as success.
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const shared = {
    root,
    name: null,
    only: null,
    targets: ['claude-code'],
    cacheDir: tmpdir(),
    dryRun: false,
    force: false,
    cwd: root,
  };

  await captureOutput(() => add({ ...shared, spec, method: 'symlink' }));
  assert.ok((await lstat(join(root, '.claude/skills/build'))).isSymbolicLink());

  // What a fresh clone has: the manifest, the lockfile, the canonical files,
  // and no symlinks, because the agent directory is commonly gitignored.
  await rm(join(root, '.claude/skills/build'), { recursive: true, force: true });

  const { result: code } = await captureOutput(() =>
    add({ ...shared, spec: null, method: null }),
  );
  assert.equal(code, 0);

  assert.ok(
    (await lstat(join(root, '.claude/skills/build'))).isSymbolicLink(),
    'the restore rebuilt the install as copies instead of relinking it',
  );
  const lock = await readLock(root);
  assert.equal(lock.build.method, 'symlink', 'the lockfile was rewritten to a method nobody chose');
});

test('add with no source still defaults to copy when the lockfile records nothing', async () => {
  // The CI case the copy default exists for: no prior install to honour, so a
  // checkout gets real files rather than links into an ephemeral workspace.
  const root = await project();
  const spec = await sourceSkill('build', GOOD);

  const shared = {
    root,
    name: null,
    only: null,
    targets: ['claude-code'],
    cacheDir: tmpdir(),
    dryRun: false,
    force: false,
    cwd: root,
  };

  await captureOutput(() => add({ ...shared, spec, method: 'copy' }));
  const lock = await readLock(root);
  assert.equal(lock.build.method, 'copy');
  assert.ok((await lstat(join(root, '.claude/skills/build'))).isDirectory());
});
