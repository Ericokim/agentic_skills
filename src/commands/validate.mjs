import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import { compile } from '../compile.mjs';
import { parseSkill } from '../skill.mjs';
import { STANDARD_VERSION } from '../standard/index.mjs';
import { bold, dim, kb, line, reportViolations, symbol, yellow } from '../ui.mjs';
import {
  BUDGETS,
  declaresStandard,
  validateAsset,
  validateCompiled,
  validateSkill,
} from '../validate.mjs';

/** Warn while a skill is still passing, so growth is visible before it fails. */
const WARN_AT = 0.8;

/**
 * Every markdown file at or under a path, split by kind.
 *
 * Bundled files ship with the skill and reach the agent the same way, so they
 * are checked too. Only the rules that make sense for them are applied: they
 * have no frontmatter and declare no standard.
 */
async function findMarkdown(target) {
  const info = await stat(target);
  if (info.isFile()) {
    return basename(target) === 'SKILL.md' ? { skills: [target], assets: [] } : { skills: [], assets: [target] };
  }

  const skills = [];
  const assets = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === 'SKILL.md') skills.push(path);
      else if (entry.name.endsWith('.md')) assets.push(path);
    }
  };
  await walk(target);
  return { skills: skills.sort(), assets: assets.sort() };
}

/**
 * What this skill will cost in context once installed.
 *
 * Measures the compiled output, not the source. The source is what you edit;
 * the compiled file is what an agent loads on every single invocation, and it
 * is larger because the standard's blocks are injected into it. Reporting the
 * source size would understate the only number that actually costs anything.
 */
function contextCost(raw) {
  try {
    return Buffer.byteLength(compile(parseSkill(raw)), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Validate skill sources without installing anything.
 *
 * The authoring loop and the CI gate, and the same code path `build` runs, so a
 * green validate means publishable: the standard's blocks can be injected and
 * the declaration holds together.
 */
export async function validate({ root, target }) {
  let found;
  try {
    found = await findMarkdown(target);
  } catch (error) {
    line(`${symbol.fail} cannot read ${target}: ${error.message}`);
    return 1;
  }

  const paths = found.skills;
  if (paths.length === 0 && found.assets.length === 0) {
    line(`${symbol.warn} no markdown found under ${bold(relative(root, target) || target)}`);
    return 1;
  }

  let failed = 0;
  let total = 0;
  let installed = 0;
  let largest = { name: null, bytes: 0 };

  line();
  for (const path of paths) {
    const raw = await readFile(path, 'utf8');
    const name = basename(dirname(path));

    // A skill that declares no standard is installed output, not a source.
    // Judging it by the source rules would report it as missing a standard
    // block that the compiler removed on purpose.
    if (!declaresStandard(raw)) {
      installed += 1;
      const violations = validateCompiled(raw, { dirname: name });
      if (violations.some((v) => v.severity === 'error')) failed += 1;
      reportViolations(`${relative(root, path) || path} ${dim('(installed)')}`, violations);
      total += Buffer.byteLength(raw, 'utf8');
      continue;
    }

    const violations = validateSkill(raw, { dirname: name });

    const source = Buffer.byteLength(raw, 'utf8');
    if (source > BUDGETS.skillBytes * WARN_AT && source <= BUDGETS.skillBytes) {
      violations.push({
        rule: 'size-budget',
        severity: 'warning',
        message: `source is ${kb(source)}, ${Math.round((source / BUDGETS.skillBytes) * 100)}% of the ${kb(BUDGETS.skillBytes)} budget, so prune before adding more`,
      });
    }

    if (violations.some((v) => v.severity === 'error')) failed += 1;
    reportViolations(relative(root, path) || path, violations);

    const cost = contextCost(raw);
    if (cost !== null) {
      total += cost;
      if (cost > largest.bytes) largest = { name, bytes: cost };
    }
  }

  for (const path of found.assets) {
    const raw = await readFile(path, 'utf8');
    const violations = validateAsset(raw);
    if (violations.some((v) => v.severity === 'error')) failed += 1;
    reportViolations(dim(relative(root, path) || path), violations);
  }

  line();
  const assetNote =
    found.assets.length > 0
      ? ` and ${found.assets.length} bundled ${found.assets.length === 1 ? 'file' : 'files'}`
      : '';
  const summary = `${paths.length} ${paths.length === 1 ? 'skill' : 'skills'}${assetNote} checked against standard ${STANDARD_VERSION}`;

  if (failed > 0) {
    line(`${symbol.fail} ${summary}, ${bold(String(failed))} failing`);
    line(dim('  a failing skill is never published, so fix it here rather than after release'));
    return 1;
  }

  line(`${symbol.ok} ${summary}, all pass`);

  if (installed > 0) {
    line(
      dim(
        `  ${installed} of these are installed skills, checked against the rules that still apply once compiled`,
      ),
    );
    line(dim('  to check declarations and invariants, validate the source they came from'));
  }

  if (largest.name) {
    const each = total / paths.length;
    line(
      dim(
        `  context cost once installed: ${kb(total)} across all, ${kb(each)} average, largest is ${largest.name} at ${kb(largest.bytes)}`,
      ),
    );
    line(dim('  only the skills an agent actually loads cost anything, one at a time'));
  }
  if (largest.bytes > BUDGETS.skillBytes) {
    line(yellow(`  ${largest.name} compiles above the source budget, so consider splitting it`));
  }
  return 0;
}
