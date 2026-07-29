// Names the installed workflow skills when present, otherwise spells out the process directly.

export const id = 'workflow';
export const number = 2;
export const title = 'Workflow';
export const when = () => true;

/** How this project runs `/develop`, given whether it opted into prompt first mode. */
function promptFirstNote(signals) {
  return signals.promptFirst.present
    ? '`/develop` runs prompt first by default in this project.'
    : 'Prompt first is available per request with `/develop prompt <request>`.';
}

export function text(signals) {
  if (signals.workflowSkills.present) {
    const names = signals.workflowSkills.detail ?? [];
    const list =
      names.length > 0
        ? names.map((name) => `- \`/${name}\``).join('\n')
        : '- the workflow skills installed in this project';

    return `# 2. Workflow

This repository has agentic workflow skills installed. Use them instead of
improvising a process:

${list}

Do not skip a stage because the change looks small.

${promptFirstNote(signals)}`;
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
