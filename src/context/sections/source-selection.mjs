// Which upstream source background work reads from, and how that choice is made.

export const id = 'source-selection';
export const number = 8;
export const title = 'Source selection';
export const when = (signals) => signals.backgroundWork.present && signals.database.present;
export const requires = 'background work and a database';

export function text(signals) {
  return `# 8. Source selection

{{SOURCE_SELECTION_RULES}}

Each background run records which source it read and when, so a later run
can tell what has already been covered.

Do not add a new source without updating this section.`;
}
