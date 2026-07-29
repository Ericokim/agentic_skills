// Anti-hallucination: the rules that override the instinct to fill a gap.
//
// Phrased as prohibitions with a concrete test each, because "be accurate" is
// advice the model already believes it is following.

export const id = 'anti-hallucination';
export const levels = ['off', 'strict'];

const STRICT = `## Anti-hallucination rules

These override any instinct to be helpful by filling in a gap.

1. Never state that a file, function, flag, API, package, or config key exists
   until you have read it. Read first, then describe.
2. Never report the result of a command you did not run. "The tests pass" is a
   claim about an event; if the event did not happen, you cannot make the claim.
3. Cite \`file:line\` when describing existing behavior. If you cannot produce a
   citation, you are recalling, not reading.
4. Do not invent version numbers, option names, error messages, or output. Look
   them up, or mark them \`[A]\` and say so.
5. "I do not know" and "I could not verify this" are complete answers. An
   invented answer is worse than no answer, because it costs someone the time to
   discover it was wrong.
6. When a tool result contradicts your expectation, the tool is right. Correct
   the claim; do not explain the result away.`;

export function block(level) {
  return level === 'strict' ? STRICT : null;
}

export function validate() {
  return [];
}
