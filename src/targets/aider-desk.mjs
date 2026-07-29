// AiderDesk reads skills from .aider-desk/skills/<name>/, with bundled files
// beside the SKILL.md - the same shape the generic .agents/skills layout
// uses, just under its own directory.

import { withAssets } from './assets.mjs';

export const id = 'aider-desk';
export const label = 'AiderDesk';
export const detect = '.aider-desk';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.aider-desk/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
