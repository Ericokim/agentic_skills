// Test driven development: the red/green loop, with the red step made evidence.
//
// The rule that carries the weight is "a test you have not watched fail proves
// nothing" — an agent that writes test and implementation together will report
// green without ever establishing the test could go red.

export const id = 'tdd';
export const levels = ['off', 'red-green', 'red-green-refactor'];

const CORE = `## Test driven development

Write the test before the code it tests.

1. **Red** — write one failing test for the next behavior. Run it. Show the
   failure as \`[O]\` evidence. A test you have not watched fail proves nothing:
   it may pass for the wrong reason, or not be running at all.
2. **Green** — write the least code that makes it pass. Run it. Show the pass as
   \`[O]\` evidence.`;

const REFACTOR = `
3. **Refactor** — with tests green, remove duplication and improve names,
   rerunning the suite after each change. Behavior does not change here.`;

const RULES = `

Rules:
- Never write implementation code before a failing test exists for it.
- Never edit a test to make a failing implementation pass. Fix the code, or say
  plainly that the test was wrong and why it was wrong.
- A skipped, pending, or commented out test is a failing test.`;

export function block(level) {
  if (level === 'red-green') return CORE + RULES;
  if (level === 'red-green-refactor') return CORE + REFACTOR + RULES;
  return null;
}

export function validate() {
  return [];
}
