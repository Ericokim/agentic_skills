// Which extracted candidates are worth acting on, and which are discarded.

export const id = 'candidate-filtering';
export const number = 12;
export const title = 'Candidate filtering';
export const when = (signals) => signals.backgroundWork.present && signals.database.present;
export const requires = 'background work and a database';

export function text(signals) {
  return `# 12. Candidate filtering

{{CANDIDATE_FILTERING_RULES}}

- Filter before storing, not after; do not write a candidate you are about
  to discard.
- Log why a candidate was rejected, not only that it was.
- Keep filtering rules in one place rather than scattered across call
  sites.`;
}
