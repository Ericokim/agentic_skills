import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, compileInPlace } from '../src/compile.mjs';
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

// compileInPlace is what `agentic build` writes back over the file it read. The
// declaration survives, because it is the part a person authors and the next
// build has to read it again. Everything else about the injection is shared with
// compile(), so these tests only cover what differs and the round trip.

test('compileInPlace keeps the declaration and injects the blocks', () => {
  const out = compileInPlace(parseSkill(source(FULL)));
  assert.match(out, /standard:\n {2}evidence: strict/);
  assert.match(out, /## Evidence classification/);
  assert.match(out, /## Definition of done/);
  assert.match(out, /Builds the thing\./);
});

test('compileInPlace is a fixpoint over its own output', () => {
  const once = compileInPlace(parseSkill(source(FULL)));
  const twice = compileInPlace(parseSkill(once));
  const thrice = compileInPlace(parseSkill(twice));
  assert.equal(twice, once, 'a second build must not change a current file');
  assert.equal(thrice, once);
});

test('compileInPlace replaces an existing region rather than stacking a second copy', () => {
  const once = compileInPlace(parseSkill(source(FULL)));
  const twice = compileInPlace(parseSkill(once));
  assert.equal(twice.match(/## Evidence classification/g).length, 1);
  assert.equal(twice.match(/## Definition of done/g).length, 1);
  assert.equal(twice.match(/<!-- agentic:standard /g).length, 2);
  assert.equal(twice.match(/<!-- \/agentic:standard -->/g).length, 2);
});

test('compileInPlace regenerates a hand edited block', () => {
  const once = compileInPlace(parseSkill(source(FULL)));
  const tampered = once.replace('## Definition of done', '## Definition of nearly done');
  assert.equal(compileInPlace(parseSkill(tampered)), once);
});

test('compileInPlace picks up a changed declaration, dropping the block no longer declared', () => {
  const once = compileInPlace(parseSkill(source(FULL)));
  const relaxed = compileInPlace(parseSkill(once.replace('  done: checklist', '  done: off')));
  assert.doesNotMatch(relaxed, /## Definition of done/);
  assert.match(relaxed, /## Evidence classification/, 'the families still declared stay');
  assert.match(relaxed, /Builds the thing\./, 'the authored prose survives');
});

test('installing what compileInPlace wrote strips the declaration and changes nothing else', () => {
  const inPlace = compileInPlace(parseSkill(source(FULL)));
  const installed = compile(parseSkill(inPlace));
  assert.equal(installed, compile(parseSkill(source(FULL))), 'one directory, one set of rules');
  assert.doesNotMatch(installed.split('---')[1], /standard:/);
});

test('compileInPlace leaves a body with no declaration alone', () => {
  const raw = `---\nname: build\ndescription: Builds.\nallowed-tools: Read\n---\n\n## Do\n\nThings.\n`;
  assert.equal(compileInPlace(parseSkill(raw)), raw);
});
