// Git resolution against a real repository, created locally.
//
// No network: the fixture is a git repo in a temp directory, cloned over a file
// url. That exercises the same clone, ref, and rev-parse path a github source
// takes, which is the part worth proving.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { FetchError, resolveSource } from '../src/fetch.mjs';
import { prepareInstall } from '../src/install.mjs';
import { parseSource } from '../src/source.mjs';

const run = promisify(execFile);

const SKILL = `---
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

/** A git repo holding one skill under skills/build, tagged v1.0.0. */
async function fixtureRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-repo-'));
  await mkdir(join(dir, 'skills', 'build'), { recursive: true });
  await writeFile(join(dir, 'skills', 'build', 'SKILL.md'), SKILL, 'utf8');

  const git = (...args) => run('git', args, { cwd: dir });
  await git('init', '--initial-branch', 'main');
  await git('config', 'user.email', 'fixture@example.com');
  await git('config', 'user.name', 'Fixture');
  await git('add', '.');
  await git('commit', '-m', 'add build skill');
  await git('tag', 'v1.0.0');

  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: dir });
  return { dir, sha: stdout.trim() };
}

const cache = () => mkdtemp(join(tmpdir(), 'agentic-cache-'));

test('clones a git source and reports the commit', async () => {
  const repo = await fixtureRepo();
  const resolved = await resolveSource(parseSource(`git+file://${repo.dir}`), {
    cacheDir: await cache(),
  });
  assert.equal(resolved.sha, repo.sha);
});

test('resolves a tag to its commit', async () => {
  const repo = await fixtureRepo();
  const resolved = await resolveSource(parseSource(`git+file://${repo.dir}#v1.0.0`), {
    cacheDir: await cache(),
  });
  assert.equal(resolved.sha, repo.sha);
});

test('resolves a raw commit sha, which cannot be cloned shallow', async () => {
  const repo = await fixtureRepo();
  const resolved = await resolveSource(parseSource(`git+file://${repo.dir}#${repo.sha}`), {
    cacheDir: await cache(),
  });
  assert.equal(resolved.sha, repo.sha);
});

test('reuses the cache on a second resolve of the same ref', async () => {
  const repo = await fixtureRepo();
  const cacheDir = await cache();
  const first = await resolveSource(parseSource(`git+file://${repo.dir}#v1.0.0`), { cacheDir });
  const second = await resolveSource(parseSource(`git+file://${repo.dir}#v1.0.0`), { cacheDir });
  assert.equal(first.dir, second.dir);
  assert.equal(second.sha, repo.sha);
});

test('installs a named skill from inside a git repo', async () => {
  // A git url has no subpath form: a file url legitimately contains slashes, so
  // splitting one off would be ambiguous. The name is what locates the skill,
  // and locateSkill looks under skills/<name>. Only the github shorthand,
  // whose owner/repo prefix is unambiguous, carries a subpath.
  const repo = await fixtureRepo();
  const root = await mkdtemp(join(tmpdir(), 'agentic-proj-'));

  const prepared = await prepareInstall({
    root,
    name: 'build',
    spec: `git+file://${repo.dir}#v1.0.0`,
    targets: ['claude-code'],
    cacheDir: await cache(),
  });

  assert.deepEqual(prepared.violations, []);
  assert.equal(prepared.name, 'build');
  assert.equal(prepared.sha, repo.sha);
  assert.match(prepared.compiled, /## Definition of done/);
});

test('a git source with a subpath in the github shorthand keeps the subpath', () => {
  const source = parseSource('github:eric/skills/skills/build#v1.0.0');
  assert.equal(source.subpath, 'skills/build');
  assert.equal(source.url, 'https://github.com/eric/skills.git');
});

test('a missing ref fails with a FetchError rather than a raw git error', async () => {
  const repo = await fixtureRepo();
  const cacheDir = await cache();
  await assert.rejects(
    () => resolveSource(parseSource(`git+file://${repo.dir}#v9.9.9`), { cacheDir }),
    FetchError,
  );
});

test('offline refuses to clone something not already cached', async () => {
  const repo = await fixtureRepo();
  const cacheDir = await cache();
  await assert.rejects(
    () => resolveSource(parseSource(`git+file://${repo.dir}`), { cacheDir, offline: true }),
    /offline/,
  );
});

test('a local source that does not exist fails clearly', async () => {
  const cacheDir = await cache();
  await assert.rejects(
    () => resolveSource(parseSource('/no/such/place'), { cacheDir }),
    /local source not found/,
  );
});
