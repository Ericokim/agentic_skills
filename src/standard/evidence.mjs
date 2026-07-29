// Evidence classification: every claim carries how it was obtained.
//
// This is the load bearing family. The other four lean on it: TDD needs the
// failing run shown, review needs findings cited, and a definition of done that
// cannot cite evidence is decoration.

export const id = 'evidence';
export const levels = ['off', 'tagged', 'strict'];

const TAGGED = `## Evidence classification

Tag every factual claim you make about this codebase or this change with how you
obtained it. An untagged claim is not a claim, it is a guess wearing a claim's
clothes.

- \`[O] Observed\` — you ran it and are quoting the result. Requires the exact
  command and its verbatim output. Paraphrased output is not Observed.
- \`[D] Derived\` — you read the source and concluded it. Requires a
  \`file:line\` citation for every claim.
- \`[A] Assumed\` — you inferred it and have not checked. Must be phrased as an
  assumption, never as a statement of fact.

Never upgrade a tag. If you did not run it, it is not \`[O]\`, however confident
you feel. If you cannot back a claim at any tier, say you do not know.`;

const STRICT_ADDENDUM = `

Strict: every claim in a report, summary, or completion message carries a tag.
One untagged claim blocks the whole report.`;

export function block(level) {
  if (level === 'tagged') return TAGGED;
  if (level === 'strict') return TAGGED + STRICT_ADDENDUM;
  return null;
}

export function validate() {
  return [];
}
