// AstrBot reads skills from data/skills/<name>/, with bundled files beside
// the SKILL.md - the same shape the generic .agents/skills layout uses, just
// under its own directory.
//
// `data/` is a plain directory too, not a dot directory, so like openclaw's
// bare `skills/` it can collide with a folder an unrelated project already
// uses for its own data. detect stays null for the same reason: astrbot only
// ever installs when named explicitly, with `-a astrbot`.

import { withAssets } from './assets.mjs';

export const id = 'astrbot';
export const label = 'AstrBot';
export const detect = null;
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/data/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
