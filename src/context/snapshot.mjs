// One bounded read of a repository, so every later stage is pure.
//
// Reading is capped on purpose. A profiler does not need every file, it needs
// the manifests, the configuration, and the shape of the tree. Reading more
// would make profiling slow on a large repository and would tempt later stages
// to grep source instead of asking the profile.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readIfPresent } from '../fs-util.mjs';

/** Directories never worth walking. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'target', '.next']);

/**
 * Dot directories worth walking into despite the general dot-directory skip:
 * CI config lives under .github, and installed library skills live under
 * .claude/skills and .agents/skills. Without this, librarySkills detection in
 * profile.mjs can never fire, because the paths it looks for never reach the
 * snapshot.
 */
const KEEP_DOTDIRS = new Set(['.github', '.claude', '.agents']);

/** Dot files that carry configuration worth reading. */
const KEEP_DOTFILES = new Set(['.env.example', '.env.sample', '.gitignore', '.nvmrc', '.tool-versions']);

/** Files whose contents a profiler actually reads. */
const INTERESTING = [
  /^package\.json$/,
  /^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lock)$/,
  /^(pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|composer\.json|Gemfile)$/,
  /^(Makefile|Taskfile\.ya?ml|Dockerfile.*|docker-compose.*)$/,
  /^\.github\/workflows\/.+\.ya?ml$/,
  /^(README|CONTRIBUTING)\.md$/i,
  /^(AGENTS|CLAUDE)\.md$/,
  /^skills-lock\.json$/, // what the skills CLI writes, so the one that exists
  /^agentic\.json$/, // this project's own settings, written by hand
  /^(tsconfig|next\.config|vite\.config|nuxt\.config|astro\.config)\.[a-z]+$/,
  /^\.env\.(example|sample)$/,
  /package\.json$/, // workspace manifests at any depth
];

const MAX_BYTES = 200_000;

function isInteresting(relative) {
  return INTERESTING.some((pattern) => pattern.test(relative));
}

/**
 * Read a repository into one object.
 *
 * @param {string} root
 * @returns {Promise<{root: string, paths: string[], files: Record<string,string>}>}
 */
export async function takeSnapshot(root) {
  const paths = [];
  const files = {};

  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith('.') && !KEEP_DOTDIRS.has(entry.name))) continue;
        await walk(join(dir, entry.name), relative);
        continue;
      }
      if (entry.name.startsWith('.') && !KEEP_DOTFILES.has(entry.name)) continue;
      paths.push(relative);
      if (!isInteresting(relative)) continue;
      const contents = await readIfPresent(join(dir, entry.name));
      if (contents !== null && contents.length <= MAX_BYTES) files[relative] = contents;
    }
  };

  await walk(root, '');
  return { root, paths: paths.sort(), files };
}
