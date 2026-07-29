// Augment reads skills from .augment/skills/<name>/, with bundled files
// beside the SKILL.md - the same shape the generic .agents/skills layout
// uses, just under its own directory.

import { withAssets } from './assets.mjs';

export const id = 'augment';
export const label = 'Augment';
export const detect = '.augment';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.augment/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
