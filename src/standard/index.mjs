// The standard: five rule families, plus the invariants that hold between them.
//
// A family owns both the prose it injects and the checks it enforces, so the
// two cannot drift apart. This module owns only what no single family can see:
// whether a declaration is coherent as a whole.

import * as evidence from './evidence.mjs';
import * as antiHallucination from './anti-hallucination.mjs';
import * as tdd from './tdd.mjs';
import * as review from './review.mjs';
import * as done from './done.mjs';

/**
 * Bumped when injected prose or invariants change. Recorded in every lockfile
 * entry, so `agentic doctor` can tell an installed skill that predates a
 * standard change from one that is current.
 */
export const STANDARD_VERSION = '1.0.0';

/**
 * Injection order in the compiled skill. Evidence comes first because the other
 * families reference its tags. `done` is pulled to the end by the compiler; it
 * is the last thing read before an agent decides whether to claim completion.
 */
export const FAMILIES = [evidence, antiHallucination, tdd, review, done];

export const TRAILING_FAMILY = done.id;

export function familyById(id) {
  return FAMILIES.find((family) => family.id === id);
}

/** Position of a level within its family, for "at least this strict" checks. */
function rank(family, level) {
  return family.levels.indexOf(level);
}

function atLeast(declaration, familyId, level) {
  const family = familyById(familyId);
  return rank(family, declaration[familyId]) >= rank(family, level);
}

/**
 * Read and check the `standard:` block of a parsed skill.
 *
 * Every family must be declared explicitly. There are no defaults: a skill that
 * does not say where it stands on evidence has not decided, and guessing a
 * default on its behalf is how a skill ends up shipping a discipline it never
 * agreed to.
 *
 * @returns {{declaration: object, violations: object[]}}
 */
export function parseDeclaration(skill) {
  const raw = skill.frontmatter.standard;
  const violations = [];

  if (raw === undefined) {
    return {
      declaration: {},
      violations: [
        {
          family: null,
          severity: 'error',
          message:
            'missing a standard: block in frontmatter, so declare all five families (evidence, anti-hallucination, tdd, review, done)',
        },
      ],
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return {
      declaration: {},
      violations: [
        {
          family: null,
          severity: 'error',
          message: 'standard: must be a block of family levels, not a single value',
        },
      ],
    };
  }

  const declaration = {};

  for (const [key, value] of Object.entries(raw)) {
    const family = familyById(key);
    if (!family) {
      violations.push({
        family: key,
        severity: 'error',
        message: `unknown standard family "${key}", so expected one of ${FAMILIES.map((f) => f.id).join(', ')}`,
      });
      continue;
    }
    if (!family.levels.includes(value)) {
      violations.push({
        family: key,
        severity: 'error',
        message: `invalid level "${value}" for ${key}, so use one of ${family.levels.join(', ')}`,
      });
      continue;
    }
    declaration[key] = value;
  }

  for (const family of FAMILIES) {
    if (declaration[family.id] === undefined && raw[family.id] === undefined) {
      violations.push({
        family: family.id,
        severity: 'error',
        message: `standard.${family.id} is not declared, so set it to one of ${family.levels.join(', ')} (use off to opt out deliberately)`,
      });
    }
  }

  return { declaration, violations };
}

/**
 * Invariants between families. These are the checks a per-file linter cannot
 * make: each one catches a declaration that is individually valid but
 * incoherent as a whole.
 */
export function checkInvariants(declaration, skill) {
  const violations = [];
  const complete = FAMILIES.every((family) => declaration[family.id] !== undefined);
  if (!complete) return violations;

  // A definition of done whose claims cannot be backed is decoration.
  if (declaration.done !== 'off' && !atLeast(declaration, 'evidence', 'tagged')) {
    violations.push({
      family: 'done',
      severity: 'error',
      message:
        'done requires evidence at tagged or stricter, because the checklist asks for [O] evidence that an untagged skill has no way to express',
    });
  }

  // The red step only means something if the failing run is shown.
  if (declaration.tdd !== 'off' && declaration.evidence !== 'strict') {
    violations.push({
      family: 'tdd',
      severity: 'error',
      message:
        'tdd requires evidence at strict, because the red step is only real if the failing run is shown as [O] evidence',
    });
  }

  for (const family of FAMILIES) {
    violations.push(...family.validate(skill, declaration[family.id]));
  }

  return violations;
}
