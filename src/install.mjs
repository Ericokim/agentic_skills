// The pipeline, assembled.
//
//   parse source -> fetch -> read -> validate -> compile -> plan -> write -> lock
//
// prepareInstall runs everything up to and including planning, and writes
// nothing. commitInstall writes. Splitting there is what makes a failed
// validation cost nothing: a skill that does not meet the standard never lands
// half installed, and --dry-run is the same code path minus the last call.
//
// installOne wraps both with the policy add and update share, so the rule about
// refusing to clobber a hand edited file is written once rather than once per
// command.

import { mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { compile } from './compile.mjs';
import { resolveSource } from './fetch.mjs';
import { collectSkillAssets, pathExists, readIfPresent } from './fs-util.mjs';
import { fileHashes, integrity, lockEntry } from './lock.mjs';
import { parseSkill } from './skill.mjs';
import { parseSource } from './source.mjs';
import { STANDARD_VERSION } from './standard/index.mjs';
import { planEmit, targetById } from './targets/index.mjs';
import { declaresStandard, validateAsset, validateCompiled, validateSkill } from './validate.mjs';

class InstallError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InstallError';
  }
}

/**
 * Every skill a source directory offers, so a source that provides many can be
 * installed in one command instead of one per skill.
 *
 * Mirrors the layouts locateSkill already understands: a repo root full of
 * skill folders, or the same one level down under skills/. A source that is a
 * single skill at its own root (dir/SKILL.md itself) has nothing to discover
 * here, on purpose - that one installs through the existing single-name path,
 * unchanged.
 */
export async function discoverSkills(dir) {
  const found = new Map();
  for (const root of [dir, join(dir, 'skills')]) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || found.has(entry.name)) continue;
      const path = join(root, entry.name);
      if (await pathExists(join(path, 'SKILL.md'))) found.set(entry.name, path);
    }
  }
  return [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, path]) => ({ name, path }));
}

/** Skill names a source directory offers, for a useful "not found" message. */
async function listSkillNames(dir) {
  return (await discoverSkills(dir)).map((skill) => skill.name);
}

/**
 * Find the SKILL.md a spec refers to.
 *
 * A source can point straight at a skill folder, or at a repo holding many.
 * Both are common, so try the obvious layouts in order and, when none match,
 * say what the source actually contains rather than only reporting a miss.
 */
export async function locateSkill(dir, name) {
  const candidates = [
    join(dir, 'SKILL.md'),
    name ? join(dir, 'skills', name, 'SKILL.md') : null,
    name ? join(dir, name, 'SKILL.md') : null,
  ].filter(Boolean);

  for (const path of candidates) {
    const contents = await readIfPresent(path);
    if (contents !== null) return { path, contents, dirname: dirname(path).split('/').pop() };
  }

  const available = await listSkillNames(dir);
  const suffix =
    available.length > 0
      ? `, and this source provides: ${available.join(', ')}`
      : ', and this source provides no SKILL.md at all';
  throw new InstallError(
    `could not find ${name ? `a skill named "${name}"` : 'a SKILL.md'}${suffix}`,
  );
}

/**
 * Every file that ships beside a SKILL.md, with its path relative to the skill.
 *
 * A skill's instructions reference these by relative path, so they have to
 * arrive with it. Installing the SKILL.md alone produces a skill that tells the
 * agent to read a file that is not there, and nothing errors: the agent just
 * improvises, which is the failure mode this project exists to prevent.
 *
 * Reads eagerly, because planning an install needs the bytes: a bundled file
 * that has to be validated and hashed before anything is written cannot be a
 * path to read later. One that disappears between the walk and the read is
 * treated as absent rather than fatal, the same as any other unreadable path.
 */
async function collectAssets(dir) {
  const found = await collectSkillAssets(dir);
  const assets = [];
  for (const asset of found) {
    const contents = await readIfPresent(asset.path);
    if (contents !== null) assets.push({ relative: asset.relative, contents });
  }
  return assets;
}

/**
 * Run the pipeline up to planning. Writes nothing.
 *
 * @returns {Promise<{name, source, sha, skill, compiled, files, violations, droppedAssets}>}
 */
export async function prepareInstall({ root, name, spec, targets, cacheDir, cwd = process.cwd() }) {
  const source = parseSource(spec);
  const { dir, sha } = await resolveSource(source, { cacheDir, cwd });

  const searchDir = source.subpath ? join(dir, source.subpath) : dir;
  const located = await locateSkill(searchDir, name);

  const skill = parseSkill(located.contents);
  const resolvedName = name ?? skill.frontmatter.name ?? located.dirname;

  // A source can itself be installed output with the declaration already
  // stripped, which a third party source often is. Holding that to the source
  // rules would report it as missing the standard block the compiler removed on
  // purpose. compile() below is unaffected either way: run on a skill that
  // declares nothing it is a no op, and run on one that carries its blocks
  // already it replaces them, so installing is idempotent end to end.
  const violations = declaresStandard(located.contents)
    ? validateSkill(located.contents, { dirname: located.dirname })
    : validateCompiled(located.contents, { dirname: located.dirname });

  // Bundled files ship with the skill and reach the agent the same way, so a
  // bad one blocks the install rather than arriving unchecked.
  const assets = await collectAssets(dirname(located.path));
  for (const asset of assets) {
    for (const item of validateAsset(asset.contents)) {
      violations.push({ ...item, message: `${asset.relative}: ${item.message}` });
    }
  }

  if (violations.some((v) => v.severity === 'error')) {
    return {
      name: resolvedName,
      source,
      sha,
      skill,
      compiled: null,
      files: [],
      assets,
      perTarget: new Map(),
      violations,
      droppedAssets: [],
    };
  }

  const compiled = compile(skill);

  // Two targets can legitimately share a path: codex writes the same
  // .agents/skills layout as generic, plus an adapter. Selecting both is
  // allowed, so collapse by path rather than writing the same bytes twice and
  // recording a duplicate in the lockfile.
  //
  // perTarget keeps each target's own file list too, alongside the merged
  // byPath view - `copy` only ever needs the merge, but a symlink install
  // needs to know which files belong to which target's own directory, to
  // decide whether that whole directory can become one symlink or has to stay
  // real because it mixes in something (codex's adapter) the shared canonical
  // copy does not have.
  const byPath = new Map();
  const perTarget = new Map();
  const dropped = new Set();
  for (const targetId of targets) {
    const target = targetById(targetId);
    const carried = target?.carriesAssets ? assets : [];
    if (assets.length > 0 && !target?.carriesAssets) dropped.add(targetId);
    const files = planEmit(targetId, {
      root,
      name: resolvedName,
      compiled,
      skill,
      assets: carried,
    });
    perTarget.set(targetId, files);
    for (const file of files) byPath.set(file.path, file);
  }

  return {
    name: resolvedName,
    source,
    sha,
    skill,
    compiled,
    files: [...byPath.values()],
    assets,
    perTarget,
    violations,
    droppedAssets: [...dropped].map((targetId) => ({ target: targetId, count: assets.length })),
  };
}

// Where the single, canonical copy of a skill lives under `symlink` method -
// one directory per skill, written once, that every selected target's
// install path then points at instead of holding its own copy of the same
// bytes.
const CANONICAL_DIR = '.agentic/skills';

export function canonicalDir(root, name) {
  return join(root, CANONICAL_DIR, name);
}

/** Write one real file, creating its parent directories first. */
async function writeReal(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

/**
 * Replace whatever is at `path` - nothing, a file, a directory, a stale
 * symlink from a previous install - with a symlink to `target`.
 *
 * Relative for project scope, so a project stays portable if it is moved or
 * cloned elsewhere; absolute for global scope, where the link and its target
 * both live under the same fixed home directory anyway.
 */
async function replaceWithSymlink(path, target, { scope, type }) {
  await mkdir(dirname(path), { recursive: true });
  await rm(path, { recursive: true, force: true });
  const to = scope === 'global' ? target : relative(dirname(path), target) || '.';
  await symlink(to, path, type);
}

/**
 * Group a skill's planned files by the directory (or, for a flat-file target
 * like cursor, the file itself) each target actually installs to.
 *
 * Two targets can plan into the very same path - codex's adapter lands
 * beside generic's SKILL.md, both under .agents/skills/<name> - and that pair
 * already collapses into one path under `copy`. Grouping here the same way is
 * what lets `symlink` decide, per root, whether the whole thing can become
 * one symlink or has to stay a real directory because it mixes in something
 * (codex's adapter) the shared canonical copy does not have.
 */
function groupByRoot(root, perTarget) {
  const roots = new Map(); // relative root path -> { kind: 'dir'|'file', files: Map<relPath, contents> }
  for (const [targetId, files] of perTarget) {
    if (files.length === 0) continue;

    if (targetId === 'cursor') {
      const [file] = files;
      const relRoot = relative(root, file.path);
      roots.set(relRoot, { kind: 'file', files: new Map([['.', file.contents]]) });
      continue;
    }

    const skillFile = files.find((file) => file.path.endsWith('/SKILL.md'));
    if (!skillFile) continue; // a target this project has no adapter for yet
    const rootPath = dirname(skillFile.path);
    const relRoot = relative(root, rootPath);
    const entry = roots.get(relRoot) ?? { kind: 'dir', files: new Map() };
    for (const file of files) entry.files.set(relative(rootPath, file.path), file.contents);
    roots.set(relRoot, entry);
  }
  return roots;
}

/**
 * Write a skill with method `symlink`: the compiled skill and its assets go
 * to the canonical directory once, and every selected target's install path
 * becomes a symlink pointing at it - a directory symlink for every
 * directory-shaped target whose output matches the canonical copy exactly, a
 * file symlink for cursor's single rule file (kept, transformed, beside the
 * canonical copy as cursor.mdc), and for a root that mixes in content the
 * canonical copy does not have (codex's adapter, sharing generic's
 * directory) a real directory with just the matching files symlinked in.
 *
 * Creating a symlink never fails the install: any error - including Windows
 * without developer mode - falls back to writing that one file or directory
 * for real, and is reported back for the caller to say so plainly.
 *
 * @returns {Promise<{canonical: string, links: string[], fallbacks: string[]}>}
 */
async function writeSymlinkInstall({ root, name, compiled, assets, perTarget, scope }) {
  const canonical = canonicalDir(root, name);
  const canonicalFiles = new Map([['SKILL.md', compiled], ...assets.map((a) => [a.relative, a.contents])]);

  const cursorFiles = perTarget.get('cursor');
  if (cursorFiles?.length > 0) canonicalFiles.set('cursor.mdc', cursorFiles[0].contents);

  for (const [relPath, contents] of canonicalFiles) {
    await writeReal(join(canonical, relPath), contents);
  }

  const links = [];
  const fallbacks = [];

  for (const [relRoot, { kind, files }] of groupByRoot(root, perTarget)) {
    const linkPath = join(root, relRoot);

    if (kind === 'file') {
      try {
        await replaceWithSymlink(linkPath, join(canonical, 'cursor.mdc'), { scope, type: 'file' });
        links.push(relRoot);
      } catch {
        await writeReal(linkPath, files.get('.'));
        fallbacks.push(`${relRoot} (could not create a symlink, copied instead)`);
      }
      continue;
    }

    const cursorCount = canonicalFiles.has('cursor.mdc') ? 1 : 0;
    const isPureShape =
      files.size === canonicalFiles.size - cursorCount &&
      [...files].every(([relPath, contents]) => canonicalFiles.get(relPath) === contents);

    let linkedWhole = false;
    if (isPureShape) {
      try {
        await replaceWithSymlink(linkPath, canonical, { scope, type: 'dir' });
        links.push(relRoot);
        linkedWhole = true;
      } catch {
        fallbacks.push(`${relRoot} (could not create a symlink, copied instead)`);
      }
    }
    if (linkedWhole) continue;

    // Either this root mixes in target-only content (codex's adapter beside
    // generic's SKILL.md) or the whole-directory symlink above failed to
    // create: either way, write a real directory here, symlinking in just the
    // files that match the canonical copy so editing that copy is still what
    // every reader of this directory sees.
    for (const [relPath, contents] of files) {
      const filePath = join(linkPath, relPath);
      if (canonicalFiles.get(relPath) === contents) {
        try {
          await replaceWithSymlink(filePath, join(canonical, relPath), { scope, type: 'file' });
          links.push(join(relRoot, relPath));
          continue;
        } catch {
          fallbacks.push(`${join(relRoot, relPath)} (could not create a symlink, copied instead)`);
        }
      }
      await writeReal(filePath, contents);
    }
  }

  return { canonical: relative(root, canonical), links, fallbacks };
}

/**
 * Write the planned files and return the lock entry describing them.
 *
 * `copy` (the default) writes every planned file for real, exactly as this
 * project always has. `symlink` writes the compiled skill once, to a
 * canonical directory, and points every selected target's install path at it
 * instead - see writeSymlinkInstall for how that split is decided per target.
 * Either way the lock entry's `files` map is hashed from the same planned
 * content, so drift detection reads the same regardless of method: a symlink
 * resolves to the canonical file's real bytes exactly as a real file would.
 */
export async function commitInstall({
  root,
  name,
  source,
  sha,
  files,
  compiled,
  assets = [],
  perTarget = new Map(),
  method = 'copy',
  scope = 'project',
}) {
  const entry = lockEntry({ source: source.toString(), sha, standard: STANDARD_VERSION, files }, root);
  entry.method = method;

  if (method === 'symlink') {
    const result = await writeSymlinkInstall({ root, name, compiled, assets, perTarget, scope });
    entry.canonical = result.canonical;
    entry.links = result.links.sort();
    return { name, entry, fallbacks: result.fallbacks };
  }

  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents, 'utf8');
  }
  return { name, entry, fallbacks: [] };
}

/**
 * Files an installed skill owns that no longer match what we wrote.
 *
 * Reported, never silently overwritten. A hand edited skill is usually somebody
 * solving a real problem in a hurry, and clobbering that without a word is how
 * a tool loses someone's trust for good.
 */
export async function detectDrift(root, entry) {
  const drifted = [];
  for (const [relative, expected] of Object.entries(entry?.files ?? {})) {
    const contents = await readIfPresent(join(root, relative));
    if (contents === null) drifted.push({ path: relative, reason: 'missing' });
    else if (integrity(contents) !== expected) drifted.push({ path: relative, reason: 'edited' });
  }
  return drifted;
}

/**
 * Would rewriting this skill produce exactly what is already installed?
 *
 * Compares the hashes of the planned output against the lockfile, rather than
 * comparing commits. A local source has no commit, and a git source can point
 * at the same commit while the standard has moved underneath it, so the output
 * is the only thing worth comparing.
 */
function wouldChangeNothing(previous, prepared, root) {
  if (previous.standard !== STANDARD_VERSION) return false;
  const planned = fileHashes(prepared.files, root);
  const plannedPaths = Object.keys(planned);
  const previousPaths = Object.keys(previous.files ?? {});
  if (plannedPaths.length !== previousPaths.length) return false;
  return plannedPaths.every((path) => previous.files[path] === planned[path]);
}

/**
 * Resolve, check, and install one skill, applying the policy every caller
 * shares. Returns a result rather than printing, so each command owns its own
 * wording.
 *
 * status is one of:
 *   error     resolution or parsing failed, see .message
 *   invalid   failed the standard, see .violations
 *   blocked   installed files were edited by hand and force was not set
 *   current   already at this commit and standard, nothing to do
 *   planned   dry run, .files is what would be written
 *   installed written, .entry is the lock entry
 */
export async function installOne({
  root,
  name,
  spec,
  targets,
  cacheDir,
  cwd,
  lock,
  force = false,
  dryRun = false,
  skipCurrent = false,
  method = 'copy',
  scope = 'project',
}) {
  let prepared;
  try {
    prepared = await prepareInstall({ root, name, spec, targets, cacheDir, cwd });
  } catch (error) {
    return { status: 'error', name: name ?? spec, message: error.message };
  }

  if (prepared.violations.some((v) => v.severity === 'error')) {
    return { status: 'invalid', name: prepared.name, violations: prepared.violations };
  }

  const previous = lock?.[prepared.name];
  const drift = previous ? await detectDrift(root, previous) : [];
  const edited = drift.filter((d) => d.reason === 'edited');

  if (edited.length > 0 && !force) {
    return { status: 'blocked', name: prepared.name, edited, prepared };
  }

  if (skipCurrent && drift.length === 0 && previous && wouldChangeNothing(previous, prepared, root)) {
    return { status: 'current', name: prepared.name, previous, prepared };
  }

  if (dryRun) {
    return { status: 'planned', name: prepared.name, prepared, previous };
  }

  const { entry, fallbacks } = await commitInstall({ root, ...prepared, method, scope });
  return { status: 'installed', name: prepared.name, entry, prepared, previous, fallbacks };
}
