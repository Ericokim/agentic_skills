// Independent review: read by something that did not write it.
//
// The `independent` level is the only one that carries a structural
// requirement, so it is the only family whose validate() does real work: a skill
// cannot promise independent review without the capability to spawn a reviewer.

export const id = 'review';
export const levels = ['off', 'self', 'independent'];

const SUBAGENT_TOOLS = ['Agent', 'Task'];

const SELF = `## Review before done

Before calling this work done, reread the diff against the acceptance criteria
in a separate pass, with the implementation reasoning set aside. Read what the
code says, not what you meant it to say. Report findings rather than quietly
fixing them, so the record shows what was wrong.`;

const INDEPENDENT = `## Independent review

Before this work can be called done, the change is read by a reviewer that did
not write it.

- **Independent means independent.** Spawn a reviewer with a fresh context and
  set its model explicitly rather than inheriting the session's. A model
  reviewing its own output shares its own blind spots.
- The reviewer reads the diff and the acceptance criteria, and **reports**. The
  reviewer does not edit code.
- Findings come back ranked by severity, each with a \`file:line\` and a concrete
  failure scenario (inputs, then the wrong result). A finding with no failure
  scenario is a style opinion; label it as one.
- The author resolves every finding or records an explicit, reasoned deferral.
  Silently dropping a finding is not resolution.`;

export function block(level) {
  if (level === 'self') return SELF;
  if (level === 'independent') return INDEPENDENT;
  return null;
}

export function validate(skill, level) {
  if (level !== 'independent') return [];
  const hasSubagent = skill.tools.some((tool) => SUBAGENT_TOOLS.includes(tool));
  if (hasSubagent) return [];
  return [
    {
      family: id,
      severity: 'error',
      message:
        'review: independent requires a subagent capability, so add Agent to allowed-tools (a skill cannot promise an independent reviewer it has no way to spawn)',
    },
  ];
}
