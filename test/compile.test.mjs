import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../src/compile.mjs';
import { parseSkill } from '../src/skill.mjs';
import { STANDARD_VERSION } from '../src/standard/index.mjs';

const source = (standard) => `---
name: build
description: Builds a feature from its spec.
allowed-tools: Read, Write, Bash, Agent
standard:
${Object.entries(standard)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join('\n')}
---

## What this skill does

Builds the thing.
`;

const FULL = {
  evidence: 'strict',
  'anti-hallucination': 'strict',
  tdd: 'red-green',
  review: 'independent',
  done: 'checklist',
};

const ALL_OFF = {
  evidence: 'off',
  'anti-hallucination': 'off',
  tdd: 'off',
  review: 'off',
  done: 'off',
};

test('injects every declared block', () => {
  const out = compile(parseSkill(source(FULL)));
  assert.match(out, /## Evidence classification/);
  assert.match(out, /## Anti-hallucination rules/);
  assert.match(out, /## Test driven development/);
  assert.match(out, /## Independent review/);
  assert.match(out, /## Definition of done/);
});

test('preserves the original body', () => {
  const out = compile(parseSkill(source(FULL)));
  assert.match(out, /## What this skill does/);
  assert.match(out, /Builds the thing\./);
});

test('strips the standard block from the emitted frontmatter', () => {
  const out = compile(parseSkill(source(FULL)));
  const frontmatter = out.split('---')[1];
  assert.doesNotMatch(frontmatter, /standard:/);
  assert.match(frontmatter, /name: build/);
  assert.match(frontmatter, /allowed-tools: Read, Write, Bash, Agent/);
});

test('places the definition of done after the body', () => {
  const out = compile(parseSkill(source(FULL)));
  assert.ok(
    out.indexOf('## Definition of done') > out.indexOf('## What this skill does'),
    'definition of done should be the last thing read',
  );
});

test('places injected preamble blocks before the body', () => {
  const out = compile(parseSkill(source(FULL)));
  assert.ok(out.indexOf('## Evidence classification') < out.indexOf('## What this skill does'));
});

test('stamps the standard version in a provenance marker', () => {
  const out = compile(parseSkill(source(FULL)));
  assert.match(out, new RegExp(`agentic:standard ${STANDARD_VERSION.replace(/\./g, '\\.')}`));
});

test('injects nothing when every family is off', () => {
  const out = compile(parseSkill(source(ALL_OFF)));
  assert.doesNotMatch(out, /## Evidence classification/);
  assert.doesNotMatch(out, /## Definition of done/);
  assert.doesNotMatch(out, /agentic:standard/);
  assert.match(out, /## What this skill does/);
});

test('is deterministic', () => {
  const skill = parseSkill(source(FULL));
  assert.equal(compile(skill), compile(skill));
});

test('is idempotent: compiling compiled output changes nothing', () => {
  const once = compile(parseSkill(source(FULL)));
  const twice = compile(parseSkill(once));
  assert.equal(twice, once);
});

test('emits a parseable skill', () => {
  const out = compile(parseSkill(source(FULL)));
  const reparsed = parseSkill(out);
  assert.equal(reparsed.frontmatter.name, 'build');
  assert.equal(reparsed.frontmatter.standard, undefined);
});

test('quotes a description containing a colon', () => {
  const out = compile(
    parseSkill(`---
name: build
description: Run this: then that
allowed-tools: Read
standard:
${Object.entries(ALL_OFF)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join('\n')}
---
body
`),
  );
  assert.match(out, /description: "Run this: then that"/);
  assert.equal(parseSkill(out).frontmatter.description, 'Run this: then that');
});
