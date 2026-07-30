// Validation: is this skill installable, and does it hold to the standard?
//
// Two concerns, deliberately kept in one pass because an author wants one
// verdict, not two:
//   - the standard (src/standard/) — the engineering discipline a skill commits
//     to, checked by the rule families and their invariants
//   - packaging — whether the skill parses, names itself correctly, fits its
//     budget, and behaves the same across agent tools
//
// Pure: source string in, violations out. Runs before anything is written, so a
// skill that fails never lands half installed.

import { SkillParseError, parseSkill } from './skill.mjs';
import { checkInvariants, parseDeclaration } from './standard/index.mjs';

/**
 * Budgets, not high water marks. A skill body loads into the agent's context on
 * every invocation, so bytes here are a recurring cost paid forever. When a
 * skill breaches, shorten the skill. Raising a ceiling to fit the file is how a
 * budget stops meaning anything.
 */
export const BUDGETS = {
  description: 400, // every installed description loads into every session
  skillBytes: 12_000, // the body loads in full on every run
  assetBytes: 8_000, // a bundled file loads whenever the skill reads it
};

const REQUIRED_FRONTMATTER = ['name', 'description', 'allowed-tools'];

const violation = (rule, message, severity = 'error') => ({ rule, severity, message });

/** Rules that read only the frontmatter. */
function checkFrontmatter(skill, dirname) {
  const out = [];
  const { frontmatter } = skill;

  for (const key of REQUIRED_FRONTMATTER) {
    if (!frontmatter[key] || String(frontmatter[key]).trim() === '') {
      out.push(violation('frontmatter-required', `frontmatter is missing "${key}"`));
    }
  }

  const name = frontmatter.name;
  if (name) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      out.push(
        violation('name-format', `name "${name}" must be kebab case (lowercase, digits, hyphens)`),
      );
    }
    if (dirname && name !== dirname) {
      out.push(
        violation(
          'name-matches-dir',
          `name "${name}" does not match its directory "${dirname}", so the skill would install under a name nobody declared`,
        ),
      );
    }
  }

  const description = frontmatter.description;
  if (description && description.length > BUDGETS.description) {
    out.push(
      violation(
        'description-length',
        `description is ${description.length} characters, over the ${BUDGETS.description} budget (it loads into every session, so trim it)`,
      ),
    );
  }

  if (skill.tools.includes('Task')) {
    out.push(
      violation(
        'subagent-tool-name',
        'allowed-tools names the legacy "Task" tool, so use "Agent" instead',
      ),
    );
  }

  return out;
}

/**
 * Cross tool portability, for any instruction text we ship.
 *
 * Runs against a SKILL.md body and against every bundled file beside it. A mode
 * file or a template is instruction text too: it loads into a context and it
 * reaches the same agent tools on operating systems we cannot see. Checking
 * only SKILL.md would leave most of the shipped words unchecked.
 *
 * @param {string} body prose to check
 * @param {string} raw the whole file, for rules that cover frontmatter as well
 * @param {number} budget size ceiling in bytes
 */
function checkProse(body, raw, budget) {
  const out = [];

  if (/\bmodel:\s*["']?(haiku|sonnet|opus|fable)\b/i.test(body)) {
    out.push(
      violation(
        'no-model-alias',
        'hardcodes a vendor model alias, so describe the tier in role words instead (a fast low cost tier, a strong model)',
      ),
    );
  }

  if (/\bthe (Task|Agent) tool\b/.test(body)) {
    out.push(
      violation(
        'capability-first',
        'names a specific subagent tool in prose, so describe the capability instead (spawn a reviewer with a fresh context)',
      ),
    );
  }

  if (/>\s*\/dev\/null|&&\s+[A-Z_]+=|\|\|\s+[A-Z_]+=/.test(body)) {
    out.push(
      violation(
        'portable-shell',
        'contains shell glue that breaks on PowerShell, so express the branching as prose and let the agent use its own tools',
      ),
    );
  }

  const longDash = /[—–]/.exec(raw);
  if (longDash) {
    out.push(
      violation(
        'no-long-dash',
        'contains an em dash or en dash, which renders inconsistently across agent tools, so use a comma, a parenthesis, or a shorter sentence',
      ),
    );
  }

  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > budget) {
    out.push(
      violation(
        'size-budget',
        `is ${bytes} bytes, over the ${budget} budget (this text loads into a context when used, so split rare long content into a file that is read only when needed)`,
      ),
    );
  }

  return out;
}

/**
 * Does this skill declare a standard, and so answer to the source rules?
 *
 * The injected marker cannot answer this, because a source keeps its blocks in
 * the file: `skills/` here is both what a person authors and what an installer
 * reads. The declaration can, and it is the exact thing the source rules need,
 * since the compiler strips it on install. Without this check, an installed
 * skill gets reported as missing a block that was removed on purpose.
 */
export function declaresStandard(raw) {
  try {
    return Object.hasOwn(parseSkill(raw).frontmatter, 'standard');
  } catch {
    return false;
  }
}

/**
 * Validate a skill that declares no standard, which in practice means an
 * installed one.
 *
 * Applies what still holds once a skill is compiled: it must parse, name
 * itself, fit its budget, and keep to the prose rules. It must not be asked for
 * a standard declaration, because the compiler removed it and put the resulting
 * rules in the body instead.
 */
export function validateCompiled(raw, { dirname = null } = {}) {
  let skill;
  try {
    skill = parseSkill(raw);
  } catch (error) {
    if (error instanceof SkillParseError) return [violation('parse', error.message)];
    throw error;
  }
  return [
    ...checkFrontmatter(skill, dirname),
    ...checkProse(skill.body, raw, BUDGETS.skillBytes + BUDGETS.assetBytes),
  ];
}

/**
 * Validate a bundled file that ships beside a SKILL.md.
 *
 * A mode file or a template has no frontmatter and declares no standard, so the
 * skill rules do not apply. The prose and size rules do, because this text
 * still reaches an agent.
 *
 * @param {string} raw contents of the bundled .md file
 */
export function validateAsset(raw) {
  return checkProse(raw, raw, BUDGETS.assetBytes);
}

/**
 * Validate one skill source.
 *
 * @param {string} raw contents of SKILL.md
 * @param {{dirname?: string}} context
 * @returns {Array<{rule: string, severity: string, message: string}>}
 */
export function validateSkill(raw, { dirname = null } = {}) {
  let skill;
  try {
    skill = parseSkill(raw);
  } catch (error) {
    if (error instanceof SkillParseError) return [violation('parse', error.message)];
    throw error;
  }

  const out = [
    ...checkFrontmatter(skill, dirname),
    ...checkProse(skill.body, raw, BUDGETS.skillBytes),
  ];

  const { declaration, violations: declarationViolations } = parseDeclaration(skill);
  for (const item of declarationViolations) {
    out.push(violation('standard-declaration', item.message));
  }
  for (const item of checkInvariants(declaration, skill)) {
    out.push(violation('standard-invariant', item.message));
  }

  return out;
}
