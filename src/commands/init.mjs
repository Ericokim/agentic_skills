import { join } from 'node:path';

import { pathExists } from '../fs-util.mjs';
import { MANIFEST_FILE, defaultManifest, readManifest, writeManifest } from '../manifest.mjs';
import { DEFAULT_TARGET, detectionHints } from '../targets/index.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

/** Which agent tools does this project already use? */
async function detectTargets(root) {
  const found = [];
  for (const hint of detectionHints()) {
    if (await pathExists(join(root, hint.dir))) found.push(hint.id);
  }
  return found.length > 0 ? [...new Set(found)] : [DEFAULT_TARGET];
}

/**
 * Write skills.json fresh: detect targets from the directories present, or
 * use the targets a caller already gave via -a/-t, and print exactly what
 * `init` prints for it.
 *
 * Shared by `init` and by `add`, which creates the manifest itself when there
 * is not one rather than making a separate command a prerequisite for
 * installing anything.
 */
export async function createManifest({ root, targets }) {
  const detected = targets.length > 0 ? targets : await detectTargets(root);
  const manifest = defaultManifest({ targets: detected });
  await writeManifest(root, manifest);

  line(`${symbol.ok} wrote ${bold(MANIFEST_FILE)}`);
  line(`  targets: ${detected.join(', ')} ${dim(targets.length > 0 ? '(from --target)' : '(detected)')}`);

  return manifest;
}

export async function init({ root, targets }) {
  const existing = await readManifest(root);
  if (existing) {
    line(`${symbol.warn} ${MANIFEST_FILE} already exists, so nothing was changed.`);
    return 0;
  }

  await createManifest({ root, targets });

  line();
  line(`${symbol.arrow} next: ${bold('agentic add <source>')}`);
  return 0;
}
