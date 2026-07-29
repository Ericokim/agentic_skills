// Rules for anything that reads a secret or acts with elevated privilege.

export const id = 'privileged-access';
export const number = 15;
export const title = 'Privileged access';
export const when = (signals) => signals.secrets.present;
export const requires = 'secrets or roles';

export function text(signals) {
  return `# 15. Privileged access

{{PRIVILEGED_ACCESS_SUMMARY}}

- Never print or log a secret value, even for debugging.
- Read secrets from {{SECRETS_SOURCE}}, never hardcode one in source.
- Use the least privileged role available for the task at hand.`;
}
