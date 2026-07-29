// What must be true about a record before it is allowed to reach storage.

export const id = 'record-validation';
export const number = 13;
export const title = 'Record validation';
export const when = (signals) => signals.database.present;
export const requires = 'a database';

export function text(signals) {
  return `# 13. Record validation

{{RECORD_VALIDATION_RULES}}

- Validate at the boundary where a record enters the system, before it is
  stored.
- Reject an invalid record with a specific reason, not a generic failure.
- Do not rely on the database schema alone to catch an invalid record.`;
}
