// Autohand Code CLI reads skills from .autohand/skills/<name>/, with bundled
// files beside the SKILL.md - the same shape the generic .agents/skills
// layout uses, just under its own directory.

import { withAssets } from './assets.mjs';

export const id = 'autohand';
export const label = 'Autohand Code CLI';
export const detect = '.autohand';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.autohand/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
