// Two filesystem questions this codebase asks constantly, in one place.
//
// Both were written three times over (in fetch, init, and install) before being
// pulled out. They look trivial, and the ENOTDIR case below is exactly the kind
// of detail that gets fixed in one copy and not the others.

import { access, readFile } from 'node:fs/promises';

export async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file, or null when there is nothing there to read.
 *
 * ENOENT is "no such file". ENOTDIR is "a path component is a file, not a
 * directory", which is what a stray .DS_Store beside real skill folders
 * produces. Both mean the same thing to every caller here.
 */
export async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}
