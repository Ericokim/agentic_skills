// Definition of done: the bar a completion claim has to clear.
//
// Injected last, at the end of the compiled skill, because it is the thing the
// agent should read immediately before it decides whether to say "done".

export const id = 'done';
export const levels = ['off', 'checklist'];

const CHECKLIST = `## Definition of done

Do not report this work as done, complete, fixed, working, or passing until
every line below holds. Check them in order and report the first that fails.

- [ ] Every acceptance criterion has \`[O]\` evidence: the command that proves
      it, and that command's verbatim output.
- [ ] No \`[A]\` claim appears in the completion report. Assumptions are either
      resolved or raised as open questions, never buried in confident prose.
- [ ] The full test suite was run, not only the new tests, and its output is
      shown.
- [ ] Every review finding is resolved, or deferred with a stated reason.
- [ ] Anything skipped is named as skipped, with what was skipped and why.

If a box cannot be ticked, say which one and why. Partial work reported
honestly is a good outcome. Complete sounding prose over unverified work is not,
and it costs the reader more than saying nothing would have.`;

export function block(level) {
  return level === 'checklist' ? CHECKLIST : null;
}

export function validate() {
  return [];
}
