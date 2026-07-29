// Rules for a feature that spans background work and the UI that watches it.

export const id = 'advanced-capability';
export const number = 20;
export const title = 'Advanced capability';
export const when = (signals) => signals.backgroundWork.present && signals.ui.present;
export const requires = 'background work and a UI';

export function text(signals) {
  return `# 20. Advanced capability

{{ADVANCED_CAPABILITY_SUMMARY}}

- The UI must reflect a background run's real state, not an assumed one;
  poll or subscribe rather than guessing when a run finished.
- Surface a background failure to the UI instead of failing silently.
- Keep the UI able to render sensibly while a run is still in progress.`;
}
