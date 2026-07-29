import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSkill, BUDGETS } from '../src/validate.mjs';

const FULL = `standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: independent
  done: checklist`;

const good = (overrides = {}) => {
  const {
    name = 'build',
    description = 'Builds a feature from its spec.',
    tools = 'Read, Write, Bash, Agent',
    body = '## What this skill does\n\nBuilds the thing.\n',
    standard = FULL,
  } = overrides;
  return `---
name: ${name}
description: ${description}
allowed-tools: ${tools}
${standard}
---

${body}`;
};

const ids = (violations) => violations.map((v) => v.rule);

test('a well formed skill passes', () => {
  const violations = validateSkill(good(), { dirname: 'build' });
  assert.deepEqual(violations, [], JSON.stringify(violations, null, 2));
});

test('flags a missing name', () => {
  const source = good().replace('name: build\n', '');
  assert.ok(ids(validateSkill(source, { dirname: 'build' })).includes('frontmatter-required'));
});

test('flags a name that does not match its directory', () => {
  const violations = validateSkill(good({ name: 'other' }), { dirname: 'build' });
  assert.ok(ids(violations).includes('name-matches-dir'));
});

test('flags a name that is not kebab case', () => {
  const violations = validateSkill(good({ name: 'Build_It' }), { dirname: 'Build_It' });
  assert.ok(ids(violations).includes('name-format'));
});

test('flags a description over the budget', () => {
  const violations = validateSkill(good({ description: 'x'.repeat(BUDGETS.description + 1) }), {
    dirname: 'build',
  });
  assert.ok(ids(violations).includes('description-length'));
});

test('flags a missing description', () => {
  const source = good().replace(/description: .*\n/, '');
  assert.ok(ids(validateSkill(source, { dirname: 'build' })).includes('frontmatter-required'));
});

test('flags an undeclared standard family', () => {
  const violations = validateSkill(good({ standard: 'standard:\n  evidence: strict' }), {
    dirname: 'build',
  });
  assert.ok(ids(violations).includes('standard-declaration'));
});

test('flags an incoherent standard combination', () => {
  const violations = validateSkill(
    good({
      standard: `standard:
  evidence: off
  anti-hallucination: strict
  tdd: off
  review: off
  done: checklist`,
    }),
    { dirname: 'build' },
  );
  assert.ok(ids(violations).includes('standard-invariant'));
});

test('flags independent review without a subagent tool', () => {
  const violations = validateSkill(good({ tools: 'Read, Write' }), { dirname: 'build' });
  assert.ok(ids(violations).includes('standard-invariant'));
});

test('flags the legacy Task tool in allowed-tools', () => {
  const violations = validateSkill(good({ tools: 'Read, Write, Task' }), { dirname: 'build' });
  assert.ok(ids(violations).includes('subagent-tool-name'));
});

test('flags a hardcoded model alias', () => {
  const violations = validateSkill(
    good({ body: '## Do it\n\nSpawn a reviewer with model: "opus" set.\n' }),
    { dirname: 'build' },
  );
  assert.ok(ids(violations).includes('no-model-alias'));
});

test('flags naming the subagent tool in prose', () => {
  const violations = validateSkill(
    good({ body: '## Do it\n\nUse the Task tool to spawn a reviewer.\n' }),
    { dirname: 'build' },
  );
  assert.ok(ids(violations).includes('capability-first'));
});

test('flags an em dash or en dash', () => {
  const em = validateSkill(good({ body: '## Do it\n\nThis is a thing — with an em dash.\n' }), {
    dirname: 'build',
  });
  assert.ok(ids(em).includes('no-long-dash'));
  const en = validateSkill(good({ body: '## Do it\n\nPages 1–2.\n' }), { dirname: 'build' });
  assert.ok(ids(en).includes('no-long-dash'));
});

test('allows a hyphen, which is not a long dash', () => {
  const violations = validateSkill(good({ body: '## Do it\n\nA well-formed compound.\n' }), {
    dirname: 'build',
  });
  assert.ok(!ids(violations).includes('no-long-dash'));
});

test('flags a body over the byte budget', () => {
  const violations = validateSkill(good({ body: 'x'.repeat(BUDGETS.skillBytes + 1) }), {
    dirname: 'build',
  });
  assert.ok(ids(violations).includes('size-budget'));
});

test('flags a shell redirect that breaks on PowerShell', () => {
  const violations = validateSkill(
    good({ body: '## Do it\n\nRun `git status >/dev/null` first.\n' }),
    { dirname: 'build' },
  );
  assert.ok(ids(violations).includes('portable-shell'));
});

test('reports a parse failure as a violation rather than throwing', () => {
  const violations = validateSkill('no frontmatter here', { dirname: 'build' });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'parse');
});

test('every violation carries a rule, severity, and message', () => {
  const violations = validateSkill(good({ name: 'other', tools: 'Read' }), { dirname: 'build' });
  assert.ok(violations.length > 0);
  for (const violation of violations) {
    assert.equal(typeof violation.rule, 'string');
    assert.ok(['error', 'warning'].includes(violation.severity));
    assert.ok(violation.message.length > 0);
  }
});
