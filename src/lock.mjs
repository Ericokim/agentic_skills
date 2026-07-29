// skills.lock: the machine truth. What is on disk, and did anyone change it.
//
// The integrity hash covers the EMITTED file, not the source. That is the whole
// point: hashing the source would tell us the upstream skill changed, which is
// what a ref already tells us. Hashing what we wrote lets `agentic list` see
// that someone hand edited an installed skill, so an update can warn instead of
// silently overwriting work that a person did on purpose.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LOCK_FILE = 'skills.lock';

export function integrity(contents) {
  return `sha256-${createHash('sha256').update(contents, 'utf8').digest('base64')}`;
}

export async function readLock(root) {
  try {
    return JSON.parse(await readFile(join(root, LOCK_FILE), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) {
      throw new Error(`${LOCK_FILE} is not valid json: ${error.message}`);
    }
    throw error;
  }
}

export async function writeLock(root, lock) {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(root, LOCK_FILE), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

/**
 * Hash a set of planned files, keyed by their path relative to the project.
 *
 * Used both to record what was written and to ask whether rewriting would
 * change anything, which is the only reliable way to answer that for a local
 * source: a directory has no commit to compare.
 *
 * @param {Array<{path: string, contents: string}>} files
 * @param {string} root
 */
export function fileHashes(files, root) {
  const hashes = {};
  for (const file of files) {
    const key = file.path.startsWith(`${root}/`) ? file.path.slice(root.length + 1) : file.path;
    hashes[key] = integrity(file.contents);
  }
  return hashes;
}

/**
 * Build the lock entry for one installed skill.
 *
 * @param {{source: string, sha: string|null, standard: string, files: Array<{path: string, contents: string}>}} input
 * @param {string} root used to store paths relative to the project
 */
export function lockEntry({ source, sha, standard, files }, root) {
  return { resolved: source, sha, standard, files: fileHashes(files, root) };
}
