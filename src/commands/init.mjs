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

export async function init({ root, targets }) {
  const existing = await readManifest(root);
  if (existing) {
    line(`${symbol.warn} ${MANIFEST_FILE} already exists, so nothing was changed.`);
    return 0;
  }

  const detected = targets.length > 0 ? targets : await detectTargets(root);
  await writeManifest(root, defaultManifest({ targets: detected }));

  line(`${symbol.ok} wrote ${bold(MANIFEST_FILE)}`);
  line(`  targets: ${detected.join(', ')} ${dim(targets.length > 0 ? '(from --target)' : '(detected)')}`);
  line();
  line(`${symbol.arrow} next: ${bold('agentic add <source>')}`);
  return 0;
}
