// The publish time compile step, run over the one directory that holds the
// skills.
//
// `skills/` is both what a person authors and what any installer reads, this
// tool's own `add` included. A person edits the prose and the `standard:`
// declaration; the build regenerates the marker delimited blocks in place. A
// third party installer that only copies (never compiles) still delivers the
// standard, because what it copies already carries it.
//
// One directory rather than a source tree and a compiled tree. The alternative
// duplicates every skill on disk, and a reader then has to know which of the two
// copies to trust. Here the file is the artifact and the build keeps one region
// of it honest.
//
// Two modes, one pipeline. Plain `build` validates every skill, refusing the
// whole build if any fails exactly as `validate` would report it, then compiles
// and writes back. `--check` runs the same validate and compile in memory but
// writes nothing, comparing against what is committed so a declaration or a
// rule family edited without a rebuild fails CI instead of shipping stale.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { compileInPlace } from '../compile.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { parseSkill } from '../skill.mjs';
import { bold, dim, line, reportViolations, symbol } from '../ui.mjs';
import { validateAsset, validateSkill } from '../validate.mjs';

export const SKILLS_DIR = 'skills';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Every file that ships beside a skill's SKILL.md, with its path relative to
 * the skill's own directory - the same shape install.mjs's collectAssets
 * produces, kept as its own copy here because the two walk different roots
 * (a fetched source directory there, skills/<name> here) for reasons that do
 * not share code cleanly.
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

/** Every skill under skills/, sorted by name. */
async function readSkills(skillsRoot) {
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(skillsRoot, entry.name);
    const raw = await readIfPresent(join(dir, 'SKILL.md'));
    if (raw === null) continue;
    skills.push({ name: entry.name, dir, raw, assets: await collectAssets(dir) });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validate every skill against the standard, printed exactly as `validate`
 * prints so the two never drift apart, and refusing the whole build the moment
 * any one fails - a build is one artifact, not nine independent ones, so a
 * single incoherent skill blocks all of it rather than shipping eight good
 * skills and silently leaving the ninth stale.
 */
async function validateAll(root, skills) {
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

/**
 * Compile every skill in place, and either write back what changed or, with
 * `check`, report what would change without writing anything.
 */
export async function build({ root, check = false }) {
  const skillsRoot = join(root, SKILLS_DIR);

  const skills = await readSkills(skillsRoot);
  if (skills.length === 0) {
    line(`${symbol.fail} no skills found under ${SKILLS_DIR}/`);
    return 1;
  }

  line();
  const failed = await validateAll(root, skills);
  line();

  if (failed > 0) {
    line(
      `${symbol.fail} ${failed} of ${skills.length} skills failed the standard, so nothing was built`,
    );
    line(dim(`  fix the skill under ${SKILLS_DIR}/, then run this again`));
    return 1;
  }

  // Compiling is idempotent, so a skill already carrying current blocks
  // compiles to the bytes it already has. That is what makes "stale" and
  // "written" the same comparison rather than two.
  const compiled = skills.map((skill) => ({
    ...skill,
    path: `${skill.name}/SKILL.md`,
    out: compileInPlace(parseSkill(skill.raw)),
  }));
  const stale = compiled.filter((skill) => skill.out !== skill.raw);

  if (check) {
    if (stale.length === 0) {
      line(
        `${symbol.ok} ${bold(`${SKILLS_DIR}/`)} matches ${skills.length} compiled skills, nothing stale`,
      );
      return 0;
    }
    line(`${symbol.fail} ${bold(`${SKILLS_DIR}/`)} is stale, so run ${bold('npm run build')}:`);
    for (const skill of stale) line(`    ${skill.path} (stale)`);
    return 1;
  }

  for (const skill of stale) {
    await writeFile(join(skill.dir, 'SKILL.md'), skill.out, 'utf8');
  }

  const bytes = compiled.reduce((sum, skill) => sum + Buffer.byteLength(skill.out, 'utf8'), 0);
  if (stale.length === 0) {
    line(
      `${symbol.ok} ${skills.length} skills in ${bold(`${SKILLS_DIR}/`)} were already current, ${kb(bytes)} total`,
    );
    return 0;
  }

  line(
    `${symbol.ok} compiled ${stale.length} of ${skills.length} skills in ${bold(`${SKILLS_DIR}/`)}, ${kb(bytes)} total`,
  );
  for (const skill of stale) line(dim(`    ${skill.path}`));
  return 0;
}
