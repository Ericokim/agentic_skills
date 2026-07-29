// Points an agent at installed skills before it reinvents one from scratch.

export const id = 'skills';
export const number = 3;
export const title = 'Skills';
export const when = () => true;

export function text(signals) {
  return `# 3. Skills

{{SKILLS_SUMMARY}}

Before writing a nontrivial capability by hand, check whether a skill
already covers it. Installed skills:

{{INSTALLED_SKILLS}}

Prefer an installed skill's documented approach over inventing a new one.`;
}
