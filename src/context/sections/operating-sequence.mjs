// The order an agent should actually work in, end to end.

export const id = 'operating-sequence';
export const number = null;
export const title = 'Operating sequence';
export const when = () => true;

export function text(signals) {
  return `## Operating sequence

1. Read this file in full before making a change.
2. Follow the workflow in section 2 for the change you are making.
3. Implement with a test written first.
4. Run the checks from {{COMMANDS_TABLE}} and read their output.
5. Report using the format above.`;
}
