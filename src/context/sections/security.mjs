// Baseline security expectations that apply regardless of what else is in play.

export const id = 'security';
export const number = 21;
export const title = 'Security';
export const when = () => true;

export function text(signals) {
  return `# 21. Security

{{SECURITY_NOTES}}

- Treat all external input as untrusted, including from a webhook or a
  queue message.
- Do not add a dependency without checking it is still maintained.
- Report a suspected vulnerability instead of quietly working around it.`;
}
