// Claude Code reads skills from .claude/skills/<name>/SKILL.md.

export const id = 'claude-code';
export const label = 'Claude Code';
export const detect = '.claude';

export function plan({ root, name, compiled }) {
  return [{ path: `${root}/.claude/skills/${name}/SKILL.md`, contents: compiled }];
}
