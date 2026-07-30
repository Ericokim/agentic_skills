import { test } from 'node:test';
import assert from 'node:assert/strict';

import { profile } from '../../src/context/profile.mjs';

const snap = (files, paths = []) => ({
  root: '/repo',
  paths: [...paths, ...Object.keys(files)],
  files,
});

test('every signal exists as a key even when absent', () => {
  const { signals } = profile(snap({}));
  for (const id of [
    'packageManager', 'languages', 'frameworks', 'database', 'httpRoutes',
    'backgroundWork', 'ui', 'browserTooling', 'secrets', 'tests', 'commands',
    'workflowSkills', 'librarySkills', 'domainLayer', 'promptFirst',
  ]) {
    assert.ok(id in signals, `${id} missing`);
    assert.equal(typeof signals[id].present, 'boolean');
    assert.ok(Array.isArray(signals[id].evidence));
  }
});

test('detects a database from a dependency', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"pg":"^8.0.0"}}' }));
  assert.equal(signals.database.present, true);
  assert.deepEqual(signals.database.evidence, ['package.json']);
});

test('detects a database from a migrations directory', () => {
  const { signals } = profile(snap({}, ['migrations/001_init.sql']));
  assert.equal(signals.database.present, true);
  assert.ok(signals.database.evidence.includes('migrations/001_init.sql'));
});

test('does not detect a database from nothing', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"lodash":"^4"}}' }));
  assert.equal(signals.database.present, false);
  assert.deepEqual(signals.database.evidence, []);
});

test('detects background work from a scheduler dependency', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"node-cron":"^3"}}' }));
  assert.equal(signals.backgroundWork.present, true);
});

test('detects browser tooling separately from a UI', () => {
  const { signals } = profile(snap({
    'package.json': '{"dependencies":{"react":"^19"},"devDependencies":{"@playwright/test":"^1"}}',
  }));
  assert.equal(signals.ui.present, true);
  assert.equal(signals.browserTooling.present, true);
});

test('reads commands from package scripts', () => {
  const { signals } = profile(snap({
    'package.json': '{"scripts":{"build":"tsc","test":"vitest run"}}',
  }));
  assert.equal(signals.commands.present, true);
  assert.deepEqual(signals.commands.detail, { build: 'tsc', test: 'vitest run' });
});

test('reads workflow skills from the skills CLI lockfile', () => {
  const { signals } = profile(snap({
    'skills-lock.json': '{"version":1,"skills":{"develop":{"source":"x"}}}',
  }));
  assert.equal(signals.workflowSkills.present, true);
  assert.deepEqual(signals.workflowSkills.detail, ['develop']);
});

test('detects library skills from .claude/skills', () => {
  const { signals } = profile(snap({}, ['.claude/skills/audit/SKILL.md']));
  assert.equal(signals.librarySkills.present, true);
  assert.deepEqual(signals.librarySkills.detail, ['audit']);
});

test('detects library skills from .agents/skills', () => {
  const { signals } = profile(snap({}, ['.agents/skills/scope/SKILL.md']));
  assert.equal(signals.librarySkills.present, true);
  assert.deepEqual(signals.librarySkills.detail, ['scope']);
});

// Prompt first mode is opted into with a file you write yourself. It used to be
// a key in skills.json, the manifest this project's own installer wrote. That
// installer is gone, so nothing creates that file, and a name sitting next to
// the skills CLI's skills-lock.json reads like its manifest when it is not.
// agentic.json says whose setting it is, and you write it yourself.

test('detects prompt first mode from agentic.json', () => {
  const { signals } = profile(snap({ 'agentic.json': '{"promptFirst":true}' }));
  assert.equal(signals.promptFirst.present, true);
  assert.deepEqual(signals.promptFirst.evidence, ['agentic.json']);
});

test('does not detect prompt first mode when the file omits it or sets it false', () => {
  const { signals: withoutField } = profile(snap({ 'agentic.json': '{}' }));
  assert.equal(withoutField.promptFirst.present, false);
  const { signals: explicitFalse } = profile(snap({ 'agentic.json': '{"promptFirst":false}' }));
  assert.equal(explicitFalse.promptFirst.present, false);
});

test('a malformed agentic.json is ignored rather than throwing', () => {
  const { signals } = profile(snap({ 'agentic.json': '{ not json' }));
  assert.equal(signals.promptFirst.present, false);
});

test('malformed json does not throw, it reports absent', () => {
  const { signals } = profile(snap({ 'package.json': '{ not json' }));
  assert.equal(signals.database.present, false);
  assert.equal(signals.commands.present, false);
});

test('is pure: the same snapshot gives the same profile', () => {
  const s = snap({ 'package.json': '{"dependencies":{"pg":"^8"}}' });
  assert.deepEqual(profile(s), profile(s));
});

test('a CI workflow counts as evidence for commands', () => {
  const { signals } = profile(snap({ '.github/workflows/ci.yml': 'name: check' }));
  assert.equal(signals.commands.present, true);
  assert.ok(signals.commands.evidence.includes('.github/workflows/ci.yml'));
});

test('a utility dependency is not a framework', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"lodash":"^4"}}' }));
  assert.equal(signals.frameworks.present, false);
});

test('a recognised framework is detected with its version', () => {
  const { signals } = profile(snap({ 'package.json': '{"dependencies":{"next":"15.0.0","lodash":"^4"}}' }));
  assert.equal(signals.frameworks.present, true);
  assert.deepEqual(signals.frameworks.detail, { next: '15.0.0' });
});

test('detects a domain layer from a domain directory', () => {
  const { signals } = profile(snap({}, ['src/domain/order.ts']));
  assert.equal(signals.domainLayer.present, true);
  assert.ok(signals.domainLayer.evidence.includes('src/domain/order.ts'));
});

test('does not detect a domain layer from a components directory', () => {
  const { signals } = profile(snap({}, ['src/components/Button.tsx']));
  assert.equal(signals.domainLayer.present, false);
});

// --- Non-JS manifests: name scan, not a parser ---

test('a requirements.txt with fastapi and celery detects httpRoutes and backgroundWork', () => {
  const { signals } = profile(snap({ 'requirements.txt': 'fastapi==0.110.0\ncelery==5.3.0\n' }));
  assert.equal(signals.httpRoutes.present, true);
  assert.deepEqual(signals.httpRoutes.evidence, ['requirements.txt']);
  assert.equal(signals.backgroundWork.present, true);
  assert.deepEqual(signals.backgroundWork.evidence, ['requirements.txt']);
});

test('a Cargo.toml with axum and sqlx detects httpRoutes and database', () => {
  const { signals } = profile(snap({
    'Cargo.toml': '[dependencies]\naxum = "0.7"\nsqlx = { version = "0.7", features = ["postgres"] }\n',
  }));
  assert.equal(signals.httpRoutes.present, true);
  assert.ok(signals.httpRoutes.evidence.includes('Cargo.toml'));
  assert.equal(signals.database.present, true);
  assert.ok(signals.database.evidence.includes('Cargo.toml'));
});

test('a go.mod with gin-gonic detects httpRoutes', () => {
  const { signals } = profile(snap({
    'go.mod': 'module example.com/app\n\nrequire github.com/gin-gonic/gin v1.9.1\n',
  }));
  assert.equal(signals.httpRoutes.present, true);
  assert.ok(signals.httpRoutes.evidence.includes('go.mod'));
});

test('a Gemfile with rails and sidekiq detects httpRoutes and backgroundWork', () => {
  const { signals } = profile(snap({
    'Gemfile': "source 'https://rubygems.org'\ngem 'rails'\ngem 'sidekiq'\n",
  }));
  assert.equal(signals.httpRoutes.present, true);
  assert.ok(signals.httpRoutes.evidence.includes('Gemfile'));
  assert.equal(signals.backgroundWork.present, true);
  assert.ok(signals.backgroundWork.evidence.includes('Gemfile'));
});

test('django in a requirements.txt is both a database and an httpRoutes signal', () => {
  const { signals } = profile(snap({ 'requirements.txt': 'django==5.0\n' }));
  assert.equal(signals.database.present, true);
  assert.equal(signals.httpRoutes.present, true);
});

test('the name scan is anchored: pgcrypto does not match pg', () => {
  const { signals } = profile(snap({ 'requirements.txt': 'pgcrypto==1.0\n' }));
  assert.equal(signals.database.present, false);
});

test('the name scan matches pg as its own token', () => {
  const { signals } = profile(snap({ 'requirements.txt': 'pg\n' }));
  assert.equal(signals.database.present, true);
  assert.deepEqual(signals.database.evidence, ['requirements.txt']);
});

test('a pyproject.toml is also scanned for dependency names', () => {
  const { signals } = profile(snap({
    'pyproject.toml': '[tool.poetry.dependencies]\nflask = "^3.0"\n',
  }));
  assert.equal(signals.httpRoutes.present, true);
});

test('a composer.json is scanned for dependency names', () => {
  const { signals } = profile(snap({
    'composer.json': '{"require": {"laravel/framework": "^11.0"}}',
  }));
  assert.equal(signals.httpRoutes.present, true);
});

// --- languages: extensions across the tree, not just TypeScript ---

test('languages reports a sorted array of detected languages', () => {
  const { signals } = profile(snap({}, ['src/main.py', 'src/app.rs']));
  assert.equal(signals.languages.present, true);
  assert.deepEqual(signals.languages.detail, ['python', 'rust']);
});

test('a mixed repo reports more than one language', () => {
  const { signals } = profile(snap({}, ['src/index.ts', 'src/worker.py', 'src/main.go']));
  assert.equal(signals.languages.present, true);
  assert.equal(signals.languages.detail.length, 3);
  assert.deepEqual(signals.languages.detail, ['go', 'python', 'typescript']);
});

test('javascript is detected distinctly from typescript', () => {
  const { signals } = profile(snap({}, ['src/index.js', 'src/util.mjs']));
  assert.deepEqual(signals.languages.detail, ['javascript']);
});

test('ruby, php, and java extensions are each detected', () => {
  const { signals } = profile(snap({}, ['app.rb', 'index.php', 'Main.java']));
  assert.deepEqual(signals.languages.detail, ['java', 'php', 'ruby']);
});

// --- packageManager: non-JS ecosystems ---

test('a requirements.txt names pip as the package manager', () => {
  const { signals } = profile(snap({ 'requirements.txt': 'flask\n' }));
  assert.equal(signals.packageManager.present, true);
  assert.equal(signals.packageManager.detail, 'pip');
});

test('a pyproject.toml names poetry as the package manager', () => {
  const { signals } = profile(snap({ 'pyproject.toml': '[tool.poetry]\nname = "x"\n' }));
  assert.equal(signals.packageManager.present, true);
  assert.equal(signals.packageManager.detail, 'poetry');
});

test('a Cargo.lock names cargo as the package manager', () => {
  const { signals } = profile(snap({}, ['Cargo.lock']));
  assert.equal(signals.packageManager.present, true);
  assert.equal(signals.packageManager.detail, 'cargo');
});

test('a go.sum names go modules as the package manager', () => {
  const { signals } = profile(snap({}, ['go.sum']));
  assert.equal(signals.packageManager.present, true);
  assert.equal(signals.packageManager.detail, 'go modules');
});

test('a Gemfile.lock names bundler as the package manager', () => {
  const { signals } = profile(snap({}, ['Gemfile.lock']));
  assert.equal(signals.packageManager.present, true);
  assert.equal(signals.packageManager.detail, 'bundler');
});

test('a composer.lock names composer as the package manager', () => {
  const { signals } = profile(snap({}, ['composer.lock']));
  assert.equal(signals.packageManager.present, true);
  assert.equal(signals.packageManager.detail, 'composer');
});

// Installation is rented from the skills CLI, which writes skills-lock.json in
// its own shape. Reading only our former skills.lock would let this signal go
// quietly dead for every project that installed the normal way, and a dead
// signal here means the generated AGENTS.md silently stops naming the workflow
// skills the project actually has.
const rentedLock = JSON.stringify({
  version: 1,
  skills: {
    develop: { source: 'Ericokim/agentic_skills', skillPath: 'skills/develop/SKILL.md' },
    audit: { source: 'Ericokim/agentic_skills', skillPath: 'skills/audit/SKILL.md' },
  },
});

test('detects workflow skills from the skills CLI lockfile', () => {
  const { signals } = profile(snap({ 'skills-lock.json': rentedLock }));
  assert.equal(signals.workflowSkills.present, true);
  assert.deepEqual(signals.workflowSkills.evidence, ['skills-lock.json']);
  assert.deepEqual(signals.workflowSkills.detail, ['audit', 'develop']);
});

test('an empty skills CLI lockfile is not a detection', () => {
  const { signals } = profile(snap({ 'skills-lock.json': JSON.stringify({ version: 1, skills: {} }) }));
  assert.equal(signals.workflowSkills.present, false);
});

test('a malformed lockfile is ignored rather than throwing', () => {
  const { signals } = profile(snap({ 'skills-lock.json': '{ not json' }));
  assert.equal(signals.workflowSkills.present, false);
});
