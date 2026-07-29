import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSkill, SkillParseError } from '../src/skill.mjs';

const MINIMAL = `---
name: build
description: Builds a feature from its spec.
allowed-tools: Read, Write, Bash
---

## What this skill does

Body text.
`;

test('parses frontmatter and body', () => {
  const skill = parseSkill(MINIMAL);
  assert.equal(skill.frontmatter.name, 'build');
  assert.equal(skill.frontmatter.description, 'Builds a feature from its spec.');
  assert.equal(skill.body.trim(), '## What this skill does\n\nBody text.');
});

test('splits allowed-tools into a list', () => {
  const skill = parseSkill(MINIMAL);
  assert.deepEqual(skill.tools, ['Read', 'Write', 'Bash']);
});

test('parses a nested standard block', () => {
  const skill = parseSkill(`---
name: build
description: d
allowed-tools: Read
standard:
  evidence: strict
  tdd: red-green
  done: checklist
---
body
`);
  assert.deepEqual(skill.frontmatter.standard, {
    evidence: 'strict',
    tdd: 'red-green',
    done: 'checklist',
  });
});

test('strips quotes from scalar values', () => {
  const skill = parseSkill(`---
name: "build"
description: 'has: a colon'
allowed-tools: Read
---
body
`);
  assert.equal(skill.frontmatter.name, 'build');
  assert.equal(skill.frontmatter.description, 'has: a colon');
});

test('keeps a colon inside an unquoted value', () => {
  const skill = parseSkill(`---
name: build
description: Run this: then that
allowed-tools: Read
---
body
`);
  assert.equal(skill.frontmatter.description, 'Run this: then that');
});

test('ignores comments and blank lines in frontmatter', () => {
  const skill = parseSkill(`---
# a comment
name: build

description: d
allowed-tools: Read
---
body
`);
  assert.equal(skill.frontmatter.name, 'build');
});

test('collects the headings present in the body', () => {
  const skill = parseSkill(`---
name: build
description: d
allowed-tools: Read
---
## First

text

### Nested

## Second
`);
  assert.deepEqual(skill.sections, ['First', 'Nested', 'Second']);
});

test('rejects a file with no frontmatter', () => {
  assert.throws(() => parseSkill('# just markdown\n'), SkillParseError);
});

test('rejects an unterminated frontmatter block', () => {
  assert.throws(() => parseSkill('---\nname: build\n'), SkillParseError);
});

test('rejects a nested value under a scalar key', () => {
  assert.throws(
    () =>
      parseSkill(`---
name: build
  oops: nested
---
body
`),
    SkillParseError,
  );
});

test('tolerates a leading byte order mark', () => {
  const skill = parseSkill('﻿' + MINIMAL);
  assert.equal(skill.frontmatter.name, 'build');
});

test('reports the line number of a malformed entry', () => {
  try {
    parseSkill(`---
name: build
this line has no colon
---
body
`);
    assert.fail('expected a parse error');
  } catch (err) {
    assert.ok(err instanceof SkillParseError);
    assert.match(err.message, /line 3/);
  }
});
