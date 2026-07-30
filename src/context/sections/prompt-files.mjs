// Where a plan waits for approval before code is written.

export const id = 'prompt-files';
export const number = 4;
export const title = 'Prompt files';
export const when = (signals) => signals.promptFirst.present;
export const requires = 'prompt first mode enabled in agentic.json';

export function text(signals) {
  return `# 4. Prompt files

{{PROMPT_FILES_PATH}} holds one file per unit of work: what is being built,
why, and the plan for building it.

- Write the prompt file before writing code for anything beyond a trivial
  fix.
- Wait for it to be approved before implementing.
- Keep it updated if the plan changes during implementation, rather than
  letting the file drift from what actually happened.`;
}
