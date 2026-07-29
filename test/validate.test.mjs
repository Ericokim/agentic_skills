import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUDGETS, isCompiled, validateAsset, validateCompiled, validateSkill } from '../src/validate.mjs';

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

// Bundled assets: the files that ship beside a SKILL.md (modes, templates).
// They carry no frontmatter and are not skills, but they are instruction text
// that loads into a context, so the prose and size rules still apply to them.

test('a clean bundled asset passes', () => {
  assert.deepEqual(validateAsset('# Template\n\nPlain prose, no frontmatter.\n'), []);
});

test('a bundled asset does not need frontmatter', () => {
  const violations = validateAsset('# Just a heading\n');
  assert.ok(!ids(violations).includes('frontmatter-required'));
  assert.ok(!ids(violations).includes('standard-declaration'));
});

test('a bundled asset is flagged for an em dash', () => {
  assert.ok(ids(validateAsset('# T\n\nA thing — and another.\n')).includes('no-long-dash'));
});

test('a bundled asset is flagged for a hardcoded model alias', () => {
  const violations = validateAsset('# T\n\nSpawn it with model: "opus" set.\n');
  assert.ok(ids(violations).includes('no-model-alias'));
});

test('a bundled asset is flagged for naming the subagent tool in prose', () => {
  assert.ok(ids(validateAsset('# T\n\nUse the Task tool.\n')).includes('capability-first'));
});

test('a bundled asset is flagged for unportable shell glue', () => {
  assert.ok(ids(validateAsset('# T\n\nRun `x >/dev/null`.\n')).includes('portable-shell'));
});

test('a bundled asset over its own budget is flagged', () => {
  const violations = validateAsset(`# T\n\n${'x'.repeat(BUDGETS.assetBytes + 1)}`);
  assert.ok(ids(violations).includes('size-budget'));
});

test('the asset budget is smaller than the skill budget', () => {
  assert.ok(BUDGETS.assetBytes < BUDGETS.skillBytes);
});

// Installed skills are compiled output, not sources. The standard block is
// stripped on install by design, so running the source rules over an installed
// directory reports a pile of failures that are not failures. A user will do
// this, so it has to answer usefully.

const compiledSkill = (body = '## What this skill does\n\nBuilds.\n') => `---
name: build
description: Builds a feature from its spec.
allowed-tools: Read, Write, Bash, Agent
---

<!-- agentic:standard 1.0.0 -->

## Evidence classification

Tag every claim.

<!-- /agentic:standard -->

${body}`;

test('recognises compiled output by its provenance marker', () => {
  assert.equal(isCompiled(compiledSkill()), true);
  assert.equal(isCompiled(good()), false);
});

test('a compiled skill is not reported as missing its standard block', () => {
  const violations = validateCompiled(compiledSkill(), { dirname: 'build' });
  assert.ok(!ids(violations).includes('standard-declaration'));
  assert.ok(!ids(violations).includes('standard-invariant'));
});

test('a clean compiled skill passes', () => {
  assert.deepEqual(validateCompiled(compiledSkill(), { dirname: 'build' }), []);
});

test('a compiled skill is still held to the prose rules', () => {
  const violations = validateCompiled(compiledSkill('## Do\n\nAn em dash — here.\n'), {
    dirname: 'build',
  });
  assert.ok(ids(violations).includes('no-long-dash'));
});

test('a compiled skill is still held to frontmatter rules', () => {
  const violations = validateCompiled(compiledSkill().replace('name: build\n', ''), {
    dirname: 'build',
  });
  assert.ok(ids(violations).includes('frontmatter-required'));
});

test('every authored skill compiles to something that passes the compiled rules', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { compile } = await import('../src/compile.mjs');
  const { parseSkill } = await import('../src/skill.mjs');

  const repo = new URL('..', import.meta.url).pathname;
  const entries = await readdir(join(repo, 'skills-src'), { withFileTypes: true });

  for (const entry of entries.filter((e) => e.isDirectory())) {
    const raw = await readFile(join(repo, 'skills-src', entry.name, 'SKILL.md'), 'utf8');
    const out = compile(parseSkill(raw));
    assert.equal(isCompiled(out), true, `${entry.name} lost its marker`);
    assert.deepEqual(
      validateCompiled(out, { dirname: entry.name }),
      [],
      `${entry.name} compiles to something that fails its own rules`,
    );
  }
});

test('the compiled output committed under skills/ passes the compiled rules for all nine skills', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const repo = new URL('..', import.meta.url).pathname;
  const entries = await readdir(join(repo, 'skills'), { withFileTypes: true });
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  assert.equal(names.length, 9, 'expected the nine compiled workflow skills');

  for (const name of names) {
    const raw = await readFile(join(repo, 'skills', name, 'SKILL.md'), 'utf8');
    assert.equal(isCompiled(raw), true, `${name} under skills/ is not compiled output`);
    assert.deepEqual(
      validateCompiled(raw, { dirname: name }),
      [],
      `${name} under skills/ fails the compiled rules`,
    );
  }
});
