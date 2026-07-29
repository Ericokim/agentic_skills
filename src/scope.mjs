// Where installed files, and the manifest/lockfile tracking them, go.
//
// Project scope is what every command has always done: skills, skills.json,
// and skills.lock all live in the project. Global scope moves the installed
// skills into the caller's home directory instead - shared across every
// project on the machine - while still tracking them with their own
// manifest and lockfile, kept under ~/.agentic rather than mixed into
// whichever project happened to be the working directory when the global
// install ran. That separation is what makes a global install updatable
// later: `agentic update` needs somewhere of its own to read what it wrote.
//
// Pure apart from the default home directory: os.homedir() is read only when
// no home is supplied, so a caller that wants this tested injects one instead.

import { homedir } from 'node:os';
import { join } from 'node:path';

export const GLOBAL_MANIFEST_DIR = '.agentic';

/**
 * @param {{scope: 'project'|'global', projectRoot: string, home?: string}} input
 * @returns {{installRoot: string, manifestRoot: string}}
 */
export function resolveRoots({ scope, projectRoot, home = homedir() }) {
  if (scope === 'global') {
    return { installRoot: home, manifestRoot: join(home, GLOBAL_MANIFEST_DIR) };
  }
  return { installRoot: projectRoot, manifestRoot: projectRoot };
}
