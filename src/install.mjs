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

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { compile } from './compile.mjs';
import { resolveSource } from './fetch.mjs';
import { pathExists, readIfPresent } from './fs-util.mjs';
import { fileHashes, integrity, lockEntry } from './lock.mjs';
import { parseSkill } from './skill.mjs';
import { parseSource } from './source.mjs';
import { STANDARD_VERSION } from './standard/index.mjs';
import { planEmit, targetById } from './targets/index.mjs';
import { validateAsset, validateSkill } from './validate.mjs';

export class InstallError extends Error {
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
 */
async function collectAssets(dir) {
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
      const contents = await readIfPresent(join(current, entry.name));
      if (contents !== null) assets.push({ relative, contents });
    }
  };
  await walk(dir, '');
  return assets.sort((a, b) => a.relative.localeCompare(b.relative));
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
  const violations = validateSkill(located.contents, { dirname: located.dirname });

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
      violations,
      droppedAssets: [],
    };
  }

  const compiled = compile(skill);

  // Two targets can legitimately share a path: codex writes the same
  // .agents/skills layout as generic, plus an adapter. Selecting both is
  // allowed, so collapse by path rather than writing the same bytes twice and
  // recording a duplicate in the lockfile.
  const byPath = new Map();
  const dropped = new Set();
  for (const targetId of targets) {
    const target = targetById(targetId);
    const carried = target?.carriesAssets ? assets : [];
    if (assets.length > 0 && !target?.carriesAssets) dropped.add(targetId);
    for (const file of planEmit(targetId, {
      root,
      name: resolvedName,
      compiled,
      skill,
      assets: carried,
    })) {
      byPath.set(file.path, file);
    }
  }

  return {
    name: resolvedName,
    source,
    sha,
    skill,
    compiled,
    files: [...byPath.values()],
    violations,
    droppedAssets: [...dropped].map((targetId) => ({ target: targetId, count: assets.length })),
  };
}

/** Write the planned files and return the lock entry describing them. */
export async function commitInstall({ root, name, source, sha, files }) {
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents, 'utf8');
  }
  return {
    name,
    entry: lockEntry({ source: source.toString(), sha, standard: STANDARD_VERSION, files }, root),
  };
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

  const { entry } = await commitInstall({ root, ...prepared });
  return { status: 'installed', name: prepared.name, entry, prepared, previous };
}
