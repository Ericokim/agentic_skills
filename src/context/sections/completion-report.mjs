// The report an agent hands back at the end of a change.

export const id = 'completion-report';
export const number = null;
export const title = 'Completion report';
export const when = () => true;

export function text(signals) {
  return `## Completion report

When a change is finished, report:

{{COMPLETION_REPORT_FORMAT}}

- What changed and why, in plain language.
- The exact commands run to verify it, with their result.
- Anything left undone, stated outright rather than left implicit.`;
}
