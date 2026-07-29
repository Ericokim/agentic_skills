// The open .agents/skills layout, read by Codex and other Agent Skills clients.
// Any tool that follows the format works here without its own adapter.

export const id = 'generic';
export const label = 'Generic (.agents/skills)';
export const detect = '.agents';

export function plan({ root, name, compiled }) {
  return [{ path: `${root}/.agents/skills/${name}/SKILL.md`, contents: compiled }];
}
