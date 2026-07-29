// How writes happen, so two code paths do not disagree about the same row.

export const id = 'storage-rules';
export const number = 10;
export const title = 'Storage rules';
export const when = (signals) => signals.database.present;
export const requires = 'a database';

export function text(signals) {
  return `# 10. Storage rules

{{STORAGE_RULES}}

- Write through {{DATA_ACCESS_LAYER}}, never with a raw query from
  elsewhere in the codebase.
- Wrap multi step writes in a transaction.
- Make writes idempotent where a run might retry.`;
}
