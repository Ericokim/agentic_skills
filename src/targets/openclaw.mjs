// OpenClaw reads skills from skills/<name>/, with bundled files beside the
// SKILL.md - the same shape the generic .agents/skills layout uses, just
// under its own directory.
//
// That directory is a bare `skills/`, not a dot directory, so unlike every
// other target it can collide with a real source folder a project already
// has (this repo has one). Auto detecting it would silently claim that
// folder the moment `skills/` existed for any reason, so detect stays null:
// openclaw only ever installs when named explicitly, with `-a openclaw`.

import { withAssets } from './assets.mjs';

export const id = 'openclaw';
export const label = 'OpenClaw';
export const detect = null;
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
