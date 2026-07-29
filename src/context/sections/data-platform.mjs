// Where data actually lives, and which access path is authoritative.

export const id = 'data-platform';
export const number = 7;
export const title = 'Data platform source of truth';
export const when = (signals) => signals.database.present;
export const requires = 'a database';

export function text() {
  return `# 7. {{DATA_PLATFORM}} source of truth

{{DATA_PLATFORM}} is the source of truth for {{PRIMARY_RECORD_NAME}}.

- Schema changes go through migrations in {{MIGRATIONS_PATH}}.
- {{PRIVILEGED_ACCESS_RULE}}
- Never read or write around the data layer.`;
}
