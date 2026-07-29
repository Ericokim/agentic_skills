// The layer that turns stored records into what the UI is allowed to show and change.

export const id = 'domain-processor';
export const number = 19;
export const title = 'Domain processor';
export const when = (signals) => signals.ui.present && signals.database.present;
export const requires = 'a UI and a domain model';

export function text(signals) {
  return `# 19. Domain processor

{{DOMAIN_PROCESSOR_SUMMARY}}

- Business rules live in {{DOMAIN_LAYER_PATH}}, not in a component or a
  route handler.
- The UI reads and writes through this layer, never straight to storage.
- A rule that applies in two places belongs here once, not twice.`;
}
