import { installOne } from '../install.mjs';
import { readLock, writeLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest } from '../manifest.mjs';
import { STANDARD_VERSION } from '../standard/index.mjs';
import { bold, dim, line, reportViolations, symbol } from '../ui.mjs';

/**
 * Re-resolve declared skills and rewrite what changed.
 *
 * An update is the normal way a standard change reaches installed skills: the
 * source can be byte identical and the output still changes, because the
 * injected blocks come from the standard rather than the source.
 */
/** Say why something was rewritten, without claiming more than we checked. */
function reasonFor({ previous, prepared }) {
  if (!previous) return 'installed';
  if (previous.standard !== STANDARD_VERSION) {
    return `standard ${previous.standard} to ${STANDARD_VERSION}`;
  }
  if (previous.sha && prepared.sha && previous.sha !== prepared.sha) return 'new commit';
  return 'source changed';
}

export async function update({ root, name, targets, cacheDir, dryRun, force, cwd }) {
  const manifest = await readManifest(root);
  if (!manifest) {
    line(`${symbol.fail} no ${MANIFEST_FILE} here, so run ${bold('agentic init')} first.`);
    return 1;
  }
  if (name && !manifest.skills[name]) {
    line(`${symbol.fail} ${bold(name)} is not in ${MANIFEST_FILE}`);
    return 1;
  }

  const names = name ? [name] : Object.keys(manifest.skills);
  if (names.length === 0) {
    line(`${symbol.warn} nothing to update: ${MANIFEST_FILE} lists no skills.`);
    return 0;
  }

  const lock = await readLock(root);
  const targetList = targets.length > 0 ? targets : manifest.targets;
  let failures = 0;
  let changed = 0;

  for (const skillName of names) {
    // An update keeps maintaining a skill the same way it was installed:
    // symlink stays symlink, copy stays copy. There is no --method for
    // update, on purpose - switching methods is what a fresh `agentic add`
    // is for.
    const method = lock[skillName]?.method ?? 'copy';
    const result = await installOne({
      root,
      name: skillName,
      spec: manifest.skills[skillName],
      targets: targetList,
      cacheDir,
      cwd,
      lock,
      force,
      dryRun,
      skipCurrent: true,
      method,
    });

    switch (result.status) {
      case 'error':
        line(`${symbol.fail} ${bold(skillName)}  ${result.message}`);
        failures += 1;
        break;

      case 'invalid':
        reportViolations(
          `${bold(skillName)} no longer meets the standard, so it was not updated`,
          result.violations,
        );
        failures += 1;
        break;

      case 'blocked':
        line(`${symbol.warn} ${bold(skillName)} has local edits, so it was left alone:`);
        for (const file of result.edited) line(`    ${dim(file.path)}`);
        line(`    ${dim('overwrite them with --force')}`);
        failures += 1;
        break;

      case 'current':
        line(`${symbol.bullet} ${bold(skillName)} ${dim('already current')}`);
        break;

      case 'planned':
        line(`${symbol.ok} ${bold(skillName)} ${dim('would be updated (dry run)')}`);
        changed += 1;
        break;

      default: {
        lock[skillName] = result.entry;
        changed += 1;
        line(`${symbol.ok} ${bold(skillName)} ${dim(reasonFor(result))}`);
        for (const fallback of result.fallbacks ?? []) {
          line(`    ${symbol.warn} ${dim(fallback)}`);
        }
      }
    }
  }

  if (!dryRun) await writeLock(root, lock);
  if (changed === 0 && failures === 0) line(dim('everything already current'));
  return failures > 0 ? 1 : 0;
}
