import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TARGETS, detectionHints, planEmit, targetById } from '../src/targets/index.mjs';
import { parseSkill } from '../src/skill.mjs';
import { compile } from '../src/compile.mjs';
import { USAGE } from '../src/cli.mjs';

const SOURCE = `---
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

const skill = parseSkill(SOURCE);
const compiled = compile(skill);

test('ships the eleven targets', () => {
  assert.deepEqual(
    TARGETS.map((t) => t.id).sort(),
    [
      'aider-desk',
      'astrbot',
      'augment',
      'autohand',
      'bob',
      'claude-code',
      'codearts',
      'codex',
      'cursor',
      'generic',
      'openclaw',
    ],
  );
});

test('every target id is unique', () => {
  const ids = TARGETS.map((t) => t.id);
  assert.deepEqual(ids, [...new Set(ids)], `duplicate target ids: ${ids.join(', ')}`);
});

test('every target id appears in the --help TARGETS list', () => {
  for (const target of TARGETS) {
    assert.ok(USAGE.includes(target.id), `--help is missing target "${target.id}"`);
  }
});

test('openclaw and astrbot are opt in only, not auto detected', () => {
  // Both write to a plain, non dot directory (skills/ and data/skills/) that
  // an unrelated project could already have for its own reasons (this repo
  // has a skills/ folder). Auto detecting either would silently claim that
  // folder, so both must stay opt in via -a.
  assert.equal(targetById('openclaw').detect, null);
  assert.equal(targetById('astrbot').detect, null);
});

test('targetById finds a target and returns undefined otherwise', () => {
  assert.equal(targetById('claude-code').id, 'claude-code');
  assert.equal(targetById('emacs'), undefined);
});

test('claude-code writes into .claude/skills/<name>/SKILL.md', () => {
  const [file] = planEmit('claude-code', { root: '/repo', name: 'build', compiled, skill });
  assert.equal(file.path, '/repo/.claude/skills/build/SKILL.md');
  assert.equal(file.contents, compiled);
});

test('codex and generic write into .agents/skills/<name>/SKILL.md', () => {
  for (const id of ['codex', 'generic']) {
    const [file] = planEmit(id, { root: '/repo', name: 'build', compiled, skill });
    assert.equal(file.path, '/repo/.agents/skills/build/SKILL.md');
  }
});

test('codex also emits its interface adapter', () => {
  const files = planEmit('codex', { root: '/repo', name: 'build', compiled, skill });
  const adapter = files.find((f) => f.path.endsWith('agents/openai.yaml'));
  assert.ok(adapter, 'expected an openai.yaml adapter');
  assert.match(adapter.contents, /interface:/);
  assert.match(adapter.contents, /build/);
});

test('cursor writes a single .mdc rule file', () => {
  const files = planEmit('cursor', { root: '/repo', name: 'build', compiled, skill });
  assert.equal(files.length, 1);
  assert.equal(files[0].path, '/repo/.cursor/rules/build.mdc');
  assert.match(files[0].contents, /^---\ndescription: /);
  assert.match(files[0].contents, /alwaysApply: false/);
});

test('cursor carries the compiled body, not the source body', () => {
  const [file] = planEmit('cursor', { root: '/repo', name: 'build', compiled, skill });
  assert.match(file.contents, /## Definition of done/);
});

test('every target produces at least one file with an absolute path', () => {
  for (const target of TARGETS) {
    const files = planEmit(target.id, { root: '/repo', name: 'build', compiled, skill });
    assert.ok(files.length > 0, `${target.id} planned no files`);
    for (const file of files) {
      assert.ok(file.path.startsWith('/repo/'), `${target.id} produced ${file.path}`);
      assert.equal(typeof file.contents, 'string');
    }
  }
});

test('planEmit rejects an unknown target', () => {
  assert.throws(
    () => planEmit('emacs', { root: '/repo', name: 'build', compiled, skill }),
    /unknown target/i,
  );
});

test('no two auto detected targets claim the same directory', () => {
  // Detecting both codex and generic for a .agents directory would plan the
  // same file twice. The open .agents layout is the neutral default; the codex
  // adapter is opt in, because its openai.yaml is only useful to Codex.
  const dirs = detectionHints().map((hint) => hint.dir);
  assert.deepEqual(dirs, [...new Set(dirs)], `duplicate detection dirs: ${dirs.join(', ')}`);
});

test('codex is selectable explicitly even though it is not auto detected', () => {
  assert.ok(targetById('codex'), 'codex must remain a valid target');
  const files = planEmit('codex', { root: '/repo', name: 'build', compiled, skill });
  assert.equal(files.length, 2);
});

// Bundled files: a skill can ship mode files and templates beside its
// SKILL.md, and its instructions tell the agent to read them by relative path.
// A target that installs the SKILL.md without them installs a broken skill.

const ASSETS = [
  { relative: 'modes/verify.md', contents: '# Verify\n' },
  { relative: 'templates/pr.md', contents: '# PR\n' },
];

test('claude-code installs bundled files beside the skill', () => {
  const files = planEmit('claude-code', {
    root: '/repo',
    name: 'check',
    compiled,
    skill,
    assets: ASSETS,
  });
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('/repo/.claude/skills/check/modes/verify.md'));
  assert.ok(paths.includes('/repo/.claude/skills/check/templates/pr.md'));
});

test('every target with carriesAssets actually emits the bundled files', () => {
  for (const target of TARGETS.filter((t) => t.carriesAssets)) {
    const paths = planEmit(target.id, {
      root: '/repo',
      name: 'check',
      compiled,
      skill,
      assets: ASSETS,
    }).map((f) => f.path);
    assert.ok(paths.some((p) => p.endsWith('modes/verify.md')), `${target.id} dropped modes/verify.md`);
    assert.ok(paths.some((p) => p.endsWith('templates/pr.md')), `${target.id} dropped templates/pr.md`);
  }
});

test('bundled file contents are carried through unchanged', () => {
  const files = planEmit('claude-code', {
    root: '/repo',
    name: 'check',
    compiled,
    skill,
    assets: ASSETS,
  });
  const mode = files.find((f) => f.path.endsWith('modes/verify.md'));
  assert.equal(mode.contents, '# Verify\n');
});

test('cursor cannot carry bundled files, and reports them as dropped', () => {
  const files = planEmit('cursor', {
    root: '/repo',
    name: 'check',
    compiled,
    skill,
    assets: ASSETS,
  });
  assert.equal(files.length, 1, 'cursor is one flat file');
  assert.equal(targetById('cursor').carriesAssets, false);
});

test('every target carries assets except cursor', () => {
  for (const target of TARGETS) {
    const expected = target.id !== 'cursor';
    assert.equal(target.carriesAssets, expected, `${target.id} carriesAssets mismatch`);
  }
});

test('planning with no assets is unchanged', () => {
  const files = planEmit('claude-code', { root: '/repo', name: 'build', compiled, skill });
  assert.equal(files.length, 1);
});
