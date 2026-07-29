// What "done" means, so a change is not called finished from hope alone.

export const id = 'definition-of-done';
export const number = null;
export const title = 'Definition of done';
export const when = () => true;

export function text(signals) {
  return `## Definition of done

A change is done when:

{{DEFINITION_OF_DONE}}

- Tests pass and you have seen the output.
- The behavior was checked, not only the code read.
- Nothing else in the repository was left broken.`;
}
