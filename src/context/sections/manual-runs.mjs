// How to trigger background work by hand, for debugging or replay.

export const id = 'manual-runs';
export const number = 16;
export const title = 'Manual runs';
export const when = (signals) => signals.backgroundWork.present;
export const requires = 'background work';

export function text(signals) {
  return `# 16. Manual runs

{{MANUAL_RUN_COMMAND}}

- A manual run must not skip the validation and filtering an automated run
  applies.
- Note in the run's output that it was triggered manually.
- Do not use a manual run as a substitute for fixing a scheduler problem.`;
}
