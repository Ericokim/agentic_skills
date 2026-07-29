import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SECTIONS, selectSections } from '../../src/context/registry.mjs';

const signals = (on = {}) => {
  const ids = ['packageManager','languages','frameworks','database','httpRoutes',
    'backgroundWork','ui','browserTooling','secrets','tests','commands',
    'workflowSkills','librarySkills'];
  return Object.fromEntries(ids.map((id) => [id, { present: Boolean(on[id]), evidence: [] }]));
};

test('every section declares the required exports', () => {
  for (const section of SECTIONS) {
    assert.equal(typeof section.id, 'string', 'id');
    assert.ok(section.number === null || typeof section.number === 'number', section.id);
    assert.equal(typeof section.title, 'string', section.id);
    assert.equal(typeof section.when, 'function', section.id);
    assert.equal(typeof section.text, 'function', section.id);
    assert.ok(section.text(signals()).length > 0, `${section.id} text is empty`);
  }
});

test('section ids are unique', () => {
  const ids = SECTIONS.map((s) => s.id);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test('numbered sections appear in ascending order', () => {
  const numbers = SECTIONS.map((s) => s.number).filter((n) => n !== null);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
});

test('always sections are selected for an empty profile', () => {
  const { included } = selectSections({ signals: signals() });
  assert.ok(included.some((s) => s.id === 'product'));
  assert.ok(included.some((s) => s.id === 'tech-stack'));
});

test('a conditional section is skipped with a reason', () => {
  const { included, skipped } = selectSections({ signals: signals() });
  assert.ok(!included.some((s) => s.id === 'data-platform'));
  const entry = skipped.find((s) => s.id === 'data-platform');
  assert.ok(entry, 'expected data-platform in skipped');
  assert.match(entry.reason, /database/);
});

test('a conditional section is included when its signal is present', () => {
  const { included } = selectSections({ signals: signals({ database: true }) });
  assert.ok(included.some((s) => s.id === 'data-platform'));
});

test('selectSections does not mutate the profile it is given', () => {
  const p = { signals: signals({ database: true }) };
  const before = JSON.stringify(p);
  selectSections(p);
  assert.equal(JSON.stringify(p), before);
});

test('the registry holds all 28 blocks', () => {
  assert.equal(SECTIONS.length, 28);
});

test('14 blocks are always included and 14 are conditional', () => {
  const always = SECTIONS.filter((s) => s.when(signals())).length;
  assert.equal(always, 14);
  assert.equal(SECTIONS.length - always, 14);
});

test('every conditional section names what it requires', () => {
  for (const section of SECTIONS) {
    if (section.when(signals())) continue;
    assert.equal(typeof section.requires, 'string', `${section.id} has no requires`);
    assert.ok(section.requires.length > 0, section.id);
  }
});

test('a full profile selects all 28', () => {
  const all = signals({
    database: true, httpRoutes: true, backgroundWork: true, ui: true,
    browserTooling: true, secrets: true,
  });
  assert.equal(selectSections({ signals: all }).included.length, 28);
});

test('no section text contains a fixed arity placeholder', () => {
  for (const section of SECTIONS) {
    assert.doesNotMatch(section.text(signals()), /\{\{[A-Z_]+_\d+\}\}/, `${section.id} has a numbered placeholder`);
  }
});

test('the workflow section names the installed skills when there are any', () => {
  const withSkills = signals({ workflowSkills: true });
  const workflow = SECTIONS.find((s) => s.id === 'workflow');
  assert.match(workflow.text(withSkills), /\/develop/);
  assert.doesNotMatch(workflow.text(signals()), /\/develop/);
});
