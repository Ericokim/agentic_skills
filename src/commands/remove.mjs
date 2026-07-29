import { rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { readLock, writeLock } from '../lock.mjs';
import { readManifest, removeSkill, writeManifest } from '../manifest.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

/**
 * Remove a skill and the files it owns.
 *
 * Only files recorded in the lockfile are deleted, so a directory somebody
 * added by hand alongside an installed skill survives.
 *
 * A skill installed with method `symlink` records two extra things a `copy`
 * install does not: `links`, the paths that are themselves symlinks (a whole
 * agent directory, or one file inside a directory that also holds real,
 * target-only content), and `canonical`, the one real directory all of them
 * point at. `links` are unlinked directly rather than walked into - reading
 * through a directory symlink is safe, but deleting `<link>/SKILL.md` is not:
 * that path resolves through the link and would delete the canonical file
 * for real, for every other agent still pointing at it. Once every link for
 * this skill is gone, the canonical directory is removed too, unless some
 * other installed skill's lock entry still names it.
 */
export async function remove({ root, name }) {
  const manifest = await readManifest(root);
  const lock = await readLock(root);

  if (!lock[name] && !manifest?.skills?.[name]) {
    line(`${symbol.warn} ${bold(name)} is not installed.`);
    return 1;
  }

  const entry = lock[name];
  const links = entry?.links ?? [];
  const removed = [];

  for (const relative of links) {
    const path = join(root, relative);
    await rm(path, { force: true });
    removed.push(relative);
  }

  for (const relative of Object.keys(entry?.files ?? {})) {
    // A path nested under (or equal to) one already unlinked above was
    // already removed by unlinking its symlink root; descending into it here
    // instead would resolve through that link and delete the canonical
    // file's real bytes, not just this agent's copy of them.
    if (links.some((link) => relative === link || relative.startsWith(`${link}/`))) continue;
    const path = join(root, relative);
    await rm(path, { force: true });
    removed.push(relative);
    // Clean up the skill's own folder when it is now empty. rmdir (not rm)
    // is the right primitive here: it only succeeds when the directory is
    // actually empty, so a folder that still holds something this skill did
    // not own is left alone rather than swept up by a recursive delete.
    await rmdir(dirname(path)).catch(() => {});
  }

  // Best effort cleanup of whatever parent directories the unlinked roots
  // leave behind: the pure-symlink case's own now-empty .claude/skills once
  // "develop" was its only entry, and the hybrid case's own root directory
  // (real, holding per-file symlinks) once every file inside it - the
  // canonicalized ones unlinked above, the rest removed as regular files
  // just above - is gone.
  for (const relative of links) {
    await rmdir(dirname(join(root, relative))).catch(() => {});
  }

  if (entry?.canonical) {
    const stillReferenced = Object.entries(lock).some(
      ([otherName, otherEntry]) => otherName !== name && otherEntry?.canonical === entry.canonical,
    );
    if (!stillReferenced) {
      await rm(join(root, entry.canonical), { recursive: true, force: true });
    }
  }

  delete lock[name];
  await writeLock(root, lock);
  if (manifest) await writeManifest(root, removeSkill(manifest, name));

  line(`${symbol.ok} removed ${bold(name)} ${dim(`(${removed.length} files)`)}`);
  return 0;
}
