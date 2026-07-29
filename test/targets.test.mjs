import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TARGETS, targetById, planEmit } from '../src/targets/index.mjs';
import { parseSkill } from '../src/skill.mjs';
import { compile } from '../src/compile.mjs';

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

test('ships the four targets', () => {
  assert.deepEqual(TARGETS.map((t) => t.id).sort(), ['claude-code', 'codex', 'cursor', 'generic']);
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
