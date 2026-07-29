// What a test run must show before its result is trusted.

export const id = 'testing-output';
export const number = 17;
export const title = 'Testing and output';
export const when = () => true;

export function text(signals) {
  return `# 17. Testing and output

{{TEST_COMMAND}}

- Run the test suite and read the actual output, not just the exit code.
- A new behavior needs a new test; a bug fix needs a test that fails
  without the fix.
- Do not mark work done from a run you have not seen finish.`;
}
