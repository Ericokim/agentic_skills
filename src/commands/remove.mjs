import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { readLock, writeLock } from '../lock.mjs';
import { readManifest, removeSkill, writeManifest } from '../manifest.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

/**
 * Remove a skill and the files it owns.
 *
 * Only files recorded in the lockfile are deleted, so a directory somebody
 * added by hand alongside an installed skill survives.
 */
export async function remove({ root, name }) {
  const manifest = await readManifest(root);
  const lock = await readLock(root);

  if (!lock[name] && !manifest?.skills?.[name]) {
    line(`${symbol.warn} ${bold(name)} is not installed.`);
    return 1;
  }

  const entry = lock[name];
  const removed = [];
  for (const relative of Object.keys(entry?.files ?? {})) {
    const path = join(root, relative);
    await rm(path, { force: true });
    removed.push(relative);
    // Clean up the skill's own folder when it is now empty.
    await rm(dirname(path), { recursive: false, force: true }).catch(() => {});
  }

  delete lock[name];
  await writeLock(root, lock);
  if (manifest) await writeManifest(root, removeSkill(manifest, name));

  line(`${symbol.ok} removed ${bold(name)} ${dim(`(${removed.length} files)`)}`);
  return 0;
}
