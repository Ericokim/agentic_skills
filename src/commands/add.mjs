import { installOne } from '../install.mjs';
import { readLock, writeLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest, setSkill, writeManifest } from '../manifest.mjs';
import { bold, dim, line, reportViolations, symbol } from '../ui.mjs';

/**
 * Install one skill, or every skill in the manifest when no spec is given.
 *
 * Validation runs before anything is written, and a skill that fails is
 * reported and skipped with a non zero exit, so a CI run that installs skills
 * fails loudly rather than shipping a skill that lies.
 */
export async function add({ root, spec, name, targets, cacheDir, dryRun, force, cwd }) {
  const manifest = await readManifest(root);
  if (!manifest) {
    line(`${symbol.fail} no ${MANIFEST_FILE} here, so run ${bold('agentic init')} first.`);
    return 1;
  }

  const requests = spec
    ? [{ spec, name }]
    : Object.entries(manifest.skills).map(([key, value]) => ({ spec: value, name: key }));

  if (requests.length === 0) {
    line(`${symbol.warn} nothing to install: ${MANIFEST_FILE} lists no skills.`);
    return 0;
  }

  const lock = await readLock(root);
  const targetList = targets.length > 0 ? targets : manifest.targets;
  let updated = manifest;
  let failures = 0;

  for (const request of requests) {
    const result = await installOne({
      root,
      name: request.name,
      spec: request.spec,
      targets: targetList,
      cacheDir,
      cwd,
      lock,
      force,
      dryRun,
    });

    switch (result.status) {
      case 'error':
        line(`${symbol.fail} ${bold(result.name)}  ${result.message}`);
        failures += 1;
        break;

      case 'invalid':
        reportViolations(
          `${bold(result.name)} does not meet the standard, so it was not installed`,
          result.violations,
        );
        failures += 1;
        break;

      case 'blocked':
        line(`${symbol.warn} ${bold(result.name)} has local edits, so it was left alone:`);
        for (const file of result.edited) line(`    ${dim(file.path)}`);
        line(`    ${dim('reinstall over them with --force')}`);
        failures += 1;
        break;

      case 'planned':
        line(`${symbol.ok} ${bold(result.name)} ${dim('(dry run, nothing written)')}`);
        for (const file of result.prepared.files) {
          line(`    ${dim(file.path.replace(`${root}/`, ''))}`);
        }
        break;

      default: {
        lock[result.name] = result.entry;
        updated = setSkill(updated, result.name, result.prepared.source.toString());
        const count = result.prepared.files.length;
        const where = count === 1 ? '1 file' : `${count} files`;
        line(
          `${symbol.ok} ${bold(result.name)} ${dim(`${result.prepared.source} ${symbol.bullet} ${where}`)}`,
        );
      }
    }
  }

  if (!dryRun) {
    await writeManifest(root, updated);
    await writeLock(root, lock);
  }

  return failures > 0 ? 1 : 0;
}
