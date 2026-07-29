// Cursor reads .cursor/rules/<name>.mdc, which is a rule file rather than a
// skill: one flat file, a different frontmatter shape, and no bundled assets.
//
// This conversion is lossy on purpose and only in one direction. Anything a
// skill would put in a sibling file has nowhere to go here, so a skill that
// depends on bundled files will install but read incomplete. The compiled body
// itself carries over intact, which is the part that changes behavior.

export const id = 'cursor';
export const label = 'Cursor';
export const detect = '.cursor';

/** Strip the skill frontmatter and keep the compiled body. */
function bodyOf(compiled) {
  const lines = compiled.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return compiled;
  const close = lines.indexOf('---', 1);
  return close === -1 ? compiled : lines.slice(close + 1).join('\n');
}

export function plan({ root, name, compiled, skill }) {
  const description = (skill.frontmatter.description ?? '').replace(/"/g, '\\"');
  const frontmatter = ['---', `description: "${description}"`, 'alwaysApply: false', '---'].join(
    '\n',
  );
  return [
    {
      path: `${root}/.cursor/rules/${name}.mdc`,
      contents: `${frontmatter}\n${bodyOf(compiled)}`,
    },
  ];
}
