// Claude Code reads skills from .claude/skills/<name>/, with bundled files
// beside the SKILL.md at the relative paths its instructions name.

import { withAssets } from './assets.mjs';

export const id = 'claude-code';
export const label = 'Claude Code';
export const detect = '.claude';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.claude/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
