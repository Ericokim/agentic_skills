// The publish time compile step: skills-src/ is what a person authors, skills/
// is the compiled output any installer, this tool's own `add` included, reads.
//
// A third party installer that only copies (never compiles) still delivers the
// standard as long as what it copies is already compiled. That is the entire
// reason this split exists: committing compiled output moves the refusal
// earlier, to a build that runs before anything is published, rather than
// leaving every installer downstream responsible for compiling correctly.
//
// Two modes, one pipeline. Plain `build` validates every source, refusing the
// whole build if any fails exactly as `validate` would report it, compiles,
// and writes. `--check` runs the same validate and compile in memory but
// writes nothing, comparing the result against what is already committed so a
// source edited without a rebuild fails CI instead of shipping stale.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { compile } from '../compile.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { parseSkill } from '../skill.mjs';
import { bold, dim, line, reportViolations, symbol } from '../ui.mjs';
import { validateAsset, validateSkill } from '../validate.mjs';

export const SOURCE_DIR = 'skills-src';
export const OUTPUT_DIR = 'skills';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Every file that ships beside a skill's SKILL.md, with its path relative to
 * the skill's own directory - the same shape install.mjs's collectAssets
 * produces, kept as its own copy here because the two walk different roots
 * (a fetched source directory there, skills-src/<name> here) for reasons that
 * do not share code cleanly.
 */
async function collectAssets(dir) {
  const assets = [];
  const walk = async (current, prefix) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), rel);
        continue;
      }
      if (entry.name === 'SKILL.md' && !prefix) continue;
      assets.push({ relative: rel, path: join(current, entry.name) });
    }
  };
  await walk(dir, '');
  return assets.sort((a, b) => a.relative.localeCompare(b.relative));
}

/** Every skill authored under skills-src/, sorted by name. */
async function readSources(srcRoot) {
  let entries;
  try {
    entries = await readdir(srcRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(srcRoot, entry.name);
    const raw = await readIfPresent(join(dir, 'SKILL.md'));
    if (raw === null) continue;
    skills.push({ name: entry.name, dir, raw, assets: await collectAssets(dir) });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validate every source against the standard, printed exactly as `validate`
 * prints so the two never drift apart, and refusing the whole build the
 * moment any one skill fails - a build is one artifact, not nine independent
 * ones, so a single incoherent skill blocks all of it rather than shipping
 * eight good skills and silently dropping the ninth.
 */
async function validateSources(root, skills) {
  let failed = 0;
  for (const skill of skills) {
    const violations = validateSkill(skill.raw, { dirname: skill.name });
    if (violations.some((v) => v.severity === 'error')) failed += 1;
    reportViolations(relative(root, join(skill.dir, 'SKILL.md')) || skill.name, violations);

    for (const asset of skill.assets) {
      const contents = await readFile(asset.path, 'utf8');
      const assetViolations = validateAsset(contents);
      if (assetViolations.some((v) => v.severity === 'error')) failed += 1;
      reportViolations(dim(relative(root, asset.path) || asset.path), assetViolations);
    }
  }
  return failed;
}

/** Compile every source in memory. Keys are paths relative to skills/. */
async function compileAll(skills) {
  const output = new Map();
  for (const skill of skills) {
    output.set(`${skill.name}/SKILL.md`, compile(parseSkill(skill.raw)));
    for (const asset of skill.assets) {
      output.set(`${skill.name}/${asset.relative}`, await readFile(asset.path, 'utf8'));
    }
  }
  return output;
}

/** Every file already on disk under a root, relative path (posix style) to contents. */
async function readTree(root) {
  const found = new Map();
  const walk = async (current, prefix) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), rel);
        continue;
      }
      found.set(rel, await readFile(join(current, entry.name), 'utf8'));
    }
  };
  await walk(root, '');
  return found;
}

/**
 * Compile every skill under skills-src/ into what an installer reads, and
 * either write it to skills/ or, with `check`, compare it against what is
 * already there without writing anything.
 */
export async function build({ root, check = false }) {
  const srcRoot = join(root, SOURCE_DIR);
  const outRoot = join(root, OUTPUT_DIR);

  const skills = await readSources(srcRoot);
  if (skills.length === 0) {
    line(`${symbol.fail} no skills found under ${SOURCE_DIR}/`);
    return 1;
  }

  line();
  const failed = await validateSources(root, skills);
  line();

  if (failed > 0) {
    line(
      `${symbol.fail} ${failed} of ${skills.length} skills failed the standard, so nothing was built`,
    );
    line(dim(`  fix the source under ${SOURCE_DIR}/, then run this again`));
    return 1;
  }

  const output = await compileAll(skills);

  if (check) {
    const onDisk = await readTree(outRoot);
    const paths = new Set([...onDisk.keys(), ...output.keys()]);
    const diffs = [];
    for (const path of [...paths].sort()) {
      if (!output.has(path)) diffs.push(`${path} (extra, no source produces this anymore)`);
      else if (!onDisk.has(path)) diffs.push(`${path} (missing from ${OUTPUT_DIR}/)`);
      else if (onDisk.get(path) !== output.get(path)) diffs.push(`${path} (stale)`);
    }

    if (diffs.length === 0) {
      line(`${symbol.ok} ${bold(`${OUTPUT_DIR}/`)} matches ${skills.length} compiled skills, nothing stale`);
      return 0;
    }

    line(`${symbol.fail} ${bold(`${OUTPUT_DIR}/`)} is stale, so run ${bold('npm run build')}:`);
    for (const diff of diffs) line(`    ${diff}`);
    return 1;
  }

  await rm(outRoot, { recursive: true, force: true });
  let bytes = 0;
  for (const [path, contents] of output) {
    const full = join(outRoot, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents, 'utf8');
    bytes += Buffer.byteLength(contents, 'utf8');
  }

  line(`${symbol.ok} compiled ${skills.length} skills to ${bold(`${OUTPUT_DIR}/`)}, ${kb(bytes)} total`);
  for (const path of [...output.keys()].sort()) line(dim(`    ${path}`));
  return 0;
}
