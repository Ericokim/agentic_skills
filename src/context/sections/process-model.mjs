// How background work is structured: what runs, how often, and how failures are handled.

export const id = 'process-model';
export const number = 9;
export const title = 'Process model';
export const when = (signals) => signals.backgroundWork.present && signals.database.present;
export const requires = 'background work and a database';

export function text(signals) {
  return `# 9. Process model

{{PROCESS_MODEL_SUMMARY}}

- A run picks up work, processes it, and records the result before
  returning.
- A failed item is retried according to {{RETRY_POLICY}}, not silently
  dropped.
- Two runs must not process the same item at once.`;
}
