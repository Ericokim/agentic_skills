import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILIES,
  STANDARD_VERSION,
  familyById,
  parseDeclaration,
  checkInvariants,
} from '../src/standard/index.mjs';
import { parseSkill } from '../src/skill.mjs';

const skillWith = (standard, tools = 'Read, Write, Bash') =>
  parseSkill(`---
name: build
description: d
allowed-tools: ${tools}
standard:
${Object.entries(standard)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join('\n')}
---
body
`);

const FULL = {
  evidence: 'strict',
  'anti-hallucination': 'strict',
  tdd: 'red-green',
  review: 'independent',
  done: 'checklist',
};

test('exposes exactly the five rule families', () => {
  assert.deepEqual(
    FAMILIES.map((f) => f.id).sort(),
    ['anti-hallucination', 'done', 'evidence', 'review', 'tdd'],
  );
});

test('the standard carries a version', () => {
  assert.match(STANDARD_VERSION, /^\d+\.\d+\.\d+$/);
});

test('every family declares off as a valid level', () => {
  for (const family of FAMILIES) {
    assert.ok(family.levels.includes('off'), `${family.id} is missing an off level`);
  }
});

test('every non-off level produces a non-empty block', () => {
  for (const family of FAMILIES) {
    for (const level of family.levels.filter((l) => l !== 'off')) {
      const block = family.block(level);
      assert.ok(block && block.trim().length > 0, `${family.id}:${level} produced no block`);
      assert.match(block, /^## /m, `${family.id}:${level} block has no heading`);
    }
  }
});

test('the off level produces no block', () => {
  for (const family of FAMILIES) {
    assert.equal(family.block('off'), null, `${family.id} emitted a block when off`);
  }
});

test('familyById finds a family and returns undefined otherwise', () => {
  assert.equal(familyById('evidence').id, 'evidence');
  assert.equal(familyById('nope'), undefined);
});

test('parseDeclaration accepts a complete declaration', () => {
  const { declaration, violations } = parseDeclaration(skillWith(FULL));
  assert.deepEqual(violations, []);
  assert.equal(declaration.evidence, 'strict');
  assert.equal(declaration.done, 'checklist');
});

test('parseDeclaration rejects a missing standard block', () => {
  const skill = parseSkill(`---
name: build
description: d
allowed-tools: Read
---
body
`);
  const { violations } = parseDeclaration(skill);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /standard/);
});

test('parseDeclaration requires every family to be declared explicitly', () => {
  const { violations } = parseDeclaration(skillWith({ evidence: 'strict' }));
  const missing = violations.map((v) => v.family).sort();
  assert.deepEqual(missing, ['anti-hallucination', 'done', 'review', 'tdd']);
});

test('parseDeclaration rejects an unknown family', () => {
  const { violations } = parseDeclaration(skillWith({ ...FULL, telepathy: 'strict' }));
  assert.ok(violations.some((v) => /unknown/i.test(v.message)));
});

test('parseDeclaration rejects an invalid level', () => {
  const { violations } = parseDeclaration(skillWith({ ...FULL, evidence: 'sorta' }));
  assert.ok(violations.some((v) => v.family === 'evidence' && /level/i.test(v.message)));
});

test('invariant: done checklist requires evidence tagged or better', () => {
  const skill = skillWith({ ...FULL, evidence: 'off', tdd: 'off' });
  const { declaration } = parseDeclaration(skill);
  const violations = checkInvariants(declaration, skill);
  assert.ok(
    violations.some((v) => /done/.test(v.message) && /evidence/.test(v.message)),
    'expected a done/evidence invariant violation',
  );
});

test('invariant: tdd red-green requires evidence strict', () => {
  const skill = skillWith({ ...FULL, evidence: 'tagged' });
  const { declaration } = parseDeclaration(skill);
  const violations = checkInvariants(declaration, skill);
  assert.ok(violations.some((v) => /tdd/.test(v.message) && /evidence/.test(v.message)));
});

test('invariant: independent review requires a subagent capability', () => {
  const skill = skillWith(FULL, 'Read, Write, Bash');
  const { declaration } = parseDeclaration(skill);
  const violations = checkInvariants(declaration, skill);
  assert.ok(
    violations.some((v) => /review/.test(v.message) && /Agent/.test(v.message)),
    'expected a review/subagent invariant violation',
  );
});

test('a coherent full declaration passes every invariant', () => {
  const skill = skillWith(FULL, 'Read, Write, Bash, Agent');
  const { declaration, violations } = parseDeclaration(skill);
  assert.deepEqual(violations, []);
  assert.deepEqual(checkInvariants(declaration, skill), []);
});

test('an all-off declaration passes every invariant', () => {
  const skill = skillWith({
    evidence: 'off',
    'anti-hallucination': 'off',
    tdd: 'off',
    review: 'off',
    done: 'off',
  });
  const { declaration, violations } = parseDeclaration(skill);
  assert.deepEqual(violations, []);
  assert.deepEqual(checkInvariants(declaration, skill), []);
});

// The standard's own prose has to obey the rules the standard enforces.
// Injected text lands in every installed skill, so a rule we break here is a
// rule we break in every skill we ship, which is worse than an author breaking
// it once.

import { validateAsset } from '../src/validate.mjs';

test('every injected block passes the rules we enforce on authors', () => {
  for (const family of FAMILIES) {
    for (const level of family.levels.filter((l) => l !== 'off')) {
      const violations = validateAsset(family.block(level));
      assert.deepEqual(
        violations,
        [],
        `${family.id}:${level} breaks a rule it enforces: ${violations.map((v) => v.rule).join(', ')}`,
      );
    }
  }
});

test('no injected block contains an em dash or en dash', () => {
  for (const family of FAMILIES) {
    for (const level of family.levels.filter((l) => l !== 'off')) {
      assert.doesNotMatch(family.block(level), /[—–]/, `${family.id}:${level} has a long dash`);
    }
  }
});
