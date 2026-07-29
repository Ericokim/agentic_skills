// The commands a maintainer actually runs, verified rather than assumed.

export const id = 'commands';
export const number = 22;
export const title = 'Commands and checks';
export const when = () => true;

export function text(signals) {
  return `# 22. Commands and checks

{{COMMANDS_TABLE}}

{{COMMAND_VERIFICATION_NOTE}}

Run the checks before claiming a change is complete, and show the output.`;
}
