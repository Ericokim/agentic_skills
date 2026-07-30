// The filesystem questions this codebase asks repeatedly, in one place.
//
// readIfPresent was written three times over before being pulled out, and the
// ENOTDIR case below is exactly the kind of detail that gets fixed in one copy
// and not the others. collectSkillAssets had two copies for the same reason.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Read a file, or null when there is nothing there to read.
 *
 * ENOENT is "no such file". ENOTDIR is "a path component is a file, not a
 * directory", which is what a stray .DS_Store beside real skill folders
 * produces. EACCES and EISDIR are also treated as absent: a profiler walks
 * whatever a repository happens to contain, and one file it lacks permission
 * to read, or a path that turned out to be a directory, must not abort the
 * whole walk over a single bad permission. Every one of these means the same
 * thing to every caller here: there was nothing usable to read.
 */
export async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EISDIR'].includes(error.code)) return null;
    throw error;
  }
}

/**
 * Every file that ships beside a skill's SKILL.md, path relative to the skill's
 * own directory, sorted so a plan is deterministic.
 *
 * What counts as a bundled file is a packaging rule, not a detail of one
 * caller: dotfiles are skipped so a stray .DS_Store never installs, and the
 * top level SKILL.md is skipped because it is the skill itself rather than
 * something shipped beside it. `install` and `build` both need that rule and
 * had a copy each, identical but for a variable name. They walk different
 * roots (a fetched source there, skills/<name> here) and want different things
 * per file (contents there, a path here), which is what kept them apart; the
 * walk itself was never the part that differed, so it lives here and the
 * callers do their own mapping.
 */
export async function collectSkillAssets(dir) {
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
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), relative);
        continue;
      }
      if (entry.name === 'SKILL.md' && !prefix) continue;
      assets.push({ relative, path: join(current, entry.name) });
    }
  };
  await walk(dir, '');
  return assets.sort((a, b) => a.relative.localeCompare(b.relative));
}
