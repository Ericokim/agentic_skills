// CodeArts Agent reads skills from .codeartsdoer/skills/<name>/, with
// bundled files beside the SKILL.md - the same shape the generic
// .agents/skills layout uses, just under its own directory.

import { withAssets } from './assets.mjs';

export const id = 'codearts';
export const label = 'CodeArts Agent';
export const detect = '.codeartsdoer';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.codeartsdoer/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
