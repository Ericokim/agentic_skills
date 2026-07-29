import { test } from 'node:test';
import assert from 'node:assert/strict';

import { githubShorthand, parseSource, SourceParseError } from '../src/source.mjs';

test('parses github shorthand', () => {
  const s = parseSource('github:eric/agentic_skills');
  assert.equal(s.kind, 'git');
  assert.equal(s.url, 'https://github.com/eric/agentic_skills.git');
  assert.equal(s.ref, null);
  assert.equal(s.subpath, null);
});

test('parses a bare owner/repo as github', () => {
  assert.equal(parseSource('eric/agentic_skills').url, 'https://github.com/eric/agentic_skills.git');
});

test('parses a ref', () => {
  assert.equal(parseSource('github:eric/skills#v1.2.0').ref, 'v1.2.0');
});

test('parses a subpath after the repo', () => {
  const s = parseSource('github:eric/skills/skills/build#v1.2.0');
  assert.equal(s.url, 'https://github.com/eric/skills.git');
  assert.equal(s.subpath, 'skills/build');
  assert.equal(s.ref, 'v1.2.0');
});

test('parses an explicit git url', () => {
  const s = parseSource('git+https://git.example.com/team/skills.git#main');
  assert.equal(s.kind, 'git');
  assert.equal(s.url, 'https://git.example.com/team/skills.git');
  assert.equal(s.ref, 'main');
});

test('parses a file source', () => {
  const s = parseSource('file:../local-skills/house-fix');
  assert.equal(s.kind, 'file');
  assert.equal(s.path, '../local-skills/house-fix');
});

test('parses a relative path as a file source', () => {
  assert.equal(parseSource('./skills/build').kind, 'file');
  assert.equal(parseSource('../elsewhere').kind, 'file');
  assert.equal(parseSource('/abs/path').kind, 'file');
});

test('round trips to a canonical string', () => {
  const spec = 'github:eric/skills/skills/build#v1.2.0';
  assert.equal(parseSource(spec).toString(), spec);
});

test('rejects an empty spec', () => {
  assert.throws(() => parseSource(''), SourceParseError);
  assert.throws(() => parseSource('   '), SourceParseError);
});

test('rejects a github spec with no repo', () => {
  assert.throws(() => parseSource('github:eric'), SourceParseError);
});

test('rejects an unknown scheme', () => {
  assert.throws(() => parseSource('ftp://example.com/skills'), SourceParseError);
});

test('githubShorthand converts a git+https github remote', () => {
  assert.equal(githubShorthand('git+https://github.com/owner/repo.git'), 'github:owner/repo');
});

test('githubShorthand converts a bare https github remote', () => {
  assert.equal(githubShorthand('https://github.com/owner/repo.git'), 'github:owner/repo');
});

test('githubShorthand returns null for a non-github url, so the caller can fail cleanly', () => {
  assert.equal(githubShorthand('https://gitlab.com/owner/repo.git'), null);
});
