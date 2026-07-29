// test/context/prefill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prefill } from '../../src/context/prefill.mjs';

const p = (signals) => ({ signals });
const sig = (over = {}) => ({
  packageManager: { present: false, evidence: [] },
  commands: { present: false, evidence: [] },
  frameworks: { present: false, evidence: [] },
  workflowSkills: { present: false, evidence: [] },
  librarySkills: { present: false, evidence: [] },
  database: { present: false, evidence: [] },
  ...over,
});

test('fills the package manager when detected', () => {
  const out = prefill(p(sig({ packageManager: { present: true, evidence: ['package-lock.json'], detail: 'npm' } })));
  assert.equal(out.PACKAGE_MANAGER, 'npm');
});

test('leaves an undetected fact unkeyed rather than guessing', () => {
  const out = prefill(p(sig()));
  assert.equal('PACKAGE_MANAGER' in out, false);
});

test('renders commands as a markdown table', () => {
  const out = prefill(p(sig({
    commands: { present: true, evidence: ['package.json'], detail: { test: 'vitest run', build: 'tsc' } },
  })));
  assert.match(out.COMMANDS_TABLE, /\| Command \| Runs \|/);
  assert.match(out.COMMANDS_TABLE, /`npm run build` \| `tsc`/);
  assert.match(out.COMMANDS_TABLE, /`npm test` \| `vitest run`/);
});

test('renders workflow skills as a list', () => {
  const out = prefill(p(sig({
    workflowSkills: { present: true, evidence: ['skills.lock'], detail: ['audit', 'develop'] },
  })));
  assert.match(out.INSTALLED_SKILLS, /- `\/audit`/);
  assert.match(out.INSTALLED_SKILLS, /- `\/develop`/);
});

test('renders a combined skills summary naming workflow and library skills', () => {
  const out = prefill(p(sig({
    workflowSkills: { present: true, evidence: ['skills.lock'], detail: ['develop'] },
    librarySkills: { present: true, evidence: ['.claude/skills/audit/SKILL.md'], detail: ['audit'] },
  })));
  assert.match(out.SKILLS_SUMMARY, /`\/develop`/);
  assert.match(out.SKILLS_SUMMARY, /`audit`/);
});

test('leaves the skills summary unkeyed when neither kind of skill is detected', () => {
  const out = prefill(p(sig()));
  assert.equal('SKILLS_SUMMARY' in out, false);
});

test('derives the run command from the detected package manager', () => {
  const out = prefill(p(sig({
    packageManager: { present: true, evidence: ['pnpm-lock.yaml'], detail: 'pnpm' },
    commands: { present: true, evidence: ['package.json'], detail: { test: 'vitest run', build: 'tsc' } },
  })));
  assert.match(out.COMMANDS_TABLE, /`pnpm run build` \| `tsc`/);
  assert.match(out.COMMANDS_TABLE, /`pnpm test` \| `vitest run`/);
});

test('falls back to npm when the package manager is unknown', () => {
  const out = prefill(p(sig({
    commands: { present: true, evidence: ['package.json'], detail: { build: 'tsc' } },
  })));
  assert.match(out.COMMANDS_TABLE, /`npm run build` \| `tsc`/);
});

test('is pure', () => {
  const input = p(sig({ packageManager: { present: true, evidence: [], detail: 'pnpm' } }));
  assert.deepEqual(prefill(input), prefill(input));
});
