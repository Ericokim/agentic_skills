// The open .agents/skills layout, read by Codex and other Agent Skills clients.
// Any tool that follows the format works here without its own adapter.

import { withAssets } from './assets.mjs';

export const id = 'generic';
export const label = 'Generic (.agents/skills)';
export const detect = '.agents';
export const carriesAssets = true;

export function plan({ root, name, compiled, assets }) {
  const dir = `${root}/.agents/skills/${name}`;
  return withAssets([{ path: `${dir}/SKILL.md`, contents: compiled }], dir, assets);
}
