// Resolution: turn a source descriptor into a directory on disk.
//
// One of the three stages that touch the world. Everything it returns is fed to
// pure code, so keeping the network confined here is what lets the standard,
// the compiler, and the validator be tested without a repo.
//
// git is the only external command, and it behaves the same on macOS, Linux,
// and Windows. No shell is invoked: arguments are passed as a list, so a repo
// url containing shell metacharacters cannot become a command.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { pathExists } from './fs-util.mjs';

const run = promisify(execFile);

export const DEFAULT_CACHE_DIR = join(homedir(), '.cache', 'agentic', 'sources');

export class FetchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FetchError';
  }
}

async function git(args, cwd) {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    // git reports progress on stderr before it reports the problem, so the
    // first line is usually "Cloning into ...". Prefer a line that names the
    // actual failure, and fall back to the last line rather than the first.
    const lines = (error.stderr || error.message || '')
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const detail =
      lines.find((line) => /^(fatal|error|warning):/i.test(line)) ?? lines.at(-1) ?? 'unknown error';
    throw new FetchError(`git ${args[0]} failed: ${detail}`);
  }
}

/** A stable cache directory per (url, ref) pair. */
function cacheKey(url, ref) {
  return createHash('sha256').update(`${url}#${ref ?? ''}`).digest('hex').slice(0, 16);
}

async function clone(url, ref, dir) {
  // A tag or branch clones shallow. A raw commit sha cannot, because --branch
  // only accepts named refs, so fall back to a full clone and check out.
  if (ref) {
    try {
      await git(['clone', '--depth', '1', '--branch', ref, url, dir]);
      return;
    } catch {
      await git(['clone', url, dir]);
      await git(['checkout', ref], dir);
      return;
    }
  }
  await git(['clone', '--depth', '1', url, dir]);
}

/**
 * Materialize a source and report the exact commit it landed on.
 *
 * @param {object} source from parseSource
 * @param {{cacheDir?: string, cwd?: string, offline?: boolean}} options
 * @returns {Promise<{dir: string, sha: string|null}>}
 */
export async function resolveSource(source, { cacheDir = DEFAULT_CACHE_DIR, cwd = process.cwd(), offline = false } = {}) {
  if (source.kind === 'file') {
    const dir = isAbsolute(source.path) ? source.path : resolve(cwd, source.path);
    if (!(await pathExists(dir))) {
      throw new FetchError(`local source not found: ${dir}`);
    }
    return { dir, sha: null };
  }

  const dir = join(cacheDir, cacheKey(source.url, source.ref));
  const cached = await pathExists(dir);

  if (!cached) {
    if (offline) throw new FetchError(`not in cache and offline: ${source.url}`);
    await mkdir(cacheDir, { recursive: true });
    await clone(source.url, source.ref, dir);
  }

  const sha = await git(['rev-parse', 'HEAD'], dir);
  return { dir, sha };
}
