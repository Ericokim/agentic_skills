// How a UI change gets checked by actually looking at it, not just by the test runner.

export const id = 'visual-testing';
export const number = 23;
export const title = 'Visual testing';
export const when = (signals) => signals.ui.present && signals.browserTooling.present;
export const requires = 'a UI and browser tooling';

export function text(signals) {
  return `# 23. Visual testing

{{VISUAL_TEST_COMMAND}}

- A UI change needs a look at the rendered page, not only a passing unit
  test.
- Check both the state before and after the change, not only the final
  screenshot.
- Note any layout difference that looks unintentional instead of ignoring
  it.`;
}
