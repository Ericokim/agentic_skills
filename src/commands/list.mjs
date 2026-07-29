import { detectDrift } from '../install.mjs';
import { readLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest } from '../manifest.mjs';
import { STANDARD_VERSION } from '../standard/index.mjs';
import { bold, cyan, dim, line, symbol, table, yellow } from '../ui.mjs';

/**
 * Every way the installed state disagrees with the declared state.
 *
 * Reports only. Nothing here writes, because each finding has more than one
 * right answer and choosing on the engineer's behalf is how a tool throws away
 * an afternoon of somebody's work.
 */
async function findProblems(root, manifest, lock) {
  const problems = [];

  for (const [name, spec] of Object.entries(manifest.skills)) {
    const entry = lock[name];
    if (!entry) {
      problems.push({ name, message: `declared but never installed`, fix: 'agentic add' });
      continue;
    }
    if (entry.resolved !== spec) {
      problems.push({
        name,
        message: `manifest asks for ${spec}, lock has ${entry.resolved}`,
        fix: `agentic update ${name}`,
      });
    }
    if (entry.standard !== STANDARD_VERSION) {
      problems.push({
        name,
        message: `compiled against standard ${entry.standard}, current is ${STANDARD_VERSION}`,
        fix: `agentic update ${name}`,
      });
    }
    for (const drift of await detectDrift(root, entry)) {
      problems.push({
        name,
        message:
          drift.reason === 'missing'
            ? `installed file is gone: ${drift.path}`
            : `installed file was edited by hand: ${drift.path}`,
        fix: drift.reason === 'missing' ? 'agentic add' : 'agentic add --force',
      });
    }
  }

  for (const name of Object.keys(lock)) {
    if (!manifest.skills[name]) {
      problems.push({
        name,
        message: `installed but not declared in ${MANIFEST_FILE}`,
        fix: `agentic remove ${name}`,
      });
    }
  }

  return problems;
}

/** One line summary of a skill's health, for the table. */
function statusOf(entry, drift) {
  if (!entry) return dim('not installed');
  if (drift.some((d) => d.reason === 'edited')) return yellow('edited locally');
  if (drift.some((d) => d.reason === 'missing')) return yellow('files missing');
  if (entry.standard !== STANDARD_VERSION) return yellow(`standard ${entry.standard}`);
  return `${symbol.ok} ok`;
}

/**
 * Show what is installed, and anything that does not add up.
 *
 * Exits non zero when something is wrong, so this doubles as the check a CI job
 * or a pre commit hook can run to catch a skill that drifted from its source.
 */
export async function list({ root }) {
  const manifest = await readManifest(root);
  if (!manifest) {
    line(`${symbol.warn} no ${MANIFEST_FILE} here, so run ${bold('agentic init')} first.`);
    return 1;
  }

  const names = Object.keys(manifest.skills);
  const lock = await readLock(root);

  if (names.length === 0 && Object.keys(lock).length === 0) {
    line(dim('no skills installed'));
    line(`${symbol.arrow} add one: ${bold('agentic add <source>')}`);
    return 0;
  }

  const rows = [[dim('SKILL'), dim('SOURCE'), dim('STANDARD'), dim('METHOD'), dim('STATUS')]];
  for (const name of names) {
    const entry = lock[name];
    const drift = entry ? await detectDrift(root, entry) : [];
    rows.push([
      bold(name),
      cyan(manifest.skills[name]),
      entry?.standard ?? dim('-'),
      entry?.method ?? dim('-'),
      statusOf(entry, drift),
    ]);
  }

  line();
  table(rows);
  line();
  line(
    dim(`targets: ${manifest.targets.join(', ')}  ${symbol.bullet}  standard ${STANDARD_VERSION}`),
  );

  const problems = await findProblems(root, manifest, lock);
  if (problems.length === 0) return 0;

  line();
  line(`${symbol.warn} ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`);
  for (const problem of problems) {
    line(`  ${bold(problem.name)}  ${problem.message}`);
    line(`    ${dim(`fix: ${problem.fix}`)}`);
  }
  return 1;
}
