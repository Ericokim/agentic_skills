// Names the installed workflow skills when present, otherwise spells out the process directly.

export const id = 'workflow';
export const number = 2;
export const title = 'Workflow';
export const when = () => true;

export function text(signals) {
  if (signals.workflowSkills.present) {
    return `# 2. Workflow

This repository has the agentic workflow skills installed. Use them instead
of improvising a process:

- \`/scope\` to turn a request into a scoped unit of work.
- \`/architect\` to plan the change before touching code.
- \`/develop\` to implement it.
- \`/check\` to verify it before calling it done.

Do not skip a stage because the change looks small.`;
  }

  return `# 2. Workflow

No workflow skills are installed, so follow this process for any change:

1. Read this file and the code it points to before forming a plan.
2. Inspect the actual code, not just file names, to see how the
   surrounding area already works.
3. Classify what you find: a small fix, a feature, or something that needs
   discussion before code is written.
4. Write a short prompt file describing the planned change and get it
   approved before implementing anything nontrivial.
5. Implement test first: write a failing test, then the code that makes it
   pass.`;
}
