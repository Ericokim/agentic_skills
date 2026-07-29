// IBM Bob reads skills from .bob/skills/<name>/, with bundled files beside
// the SKILL.md - the same shape the generic .agents/skills layout uses, just
// under its own directory.

import { withAssets } from './assets.mjs';

export const id = 'bob';
export const label = 'IBM Bob';
export const detect = '.bob';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.bob/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
