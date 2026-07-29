// Compiles a skill source into the self contained skill that gets installed.
//
// This is why the package manager exists. The alternative, which the tools we
// mapped from all settle for, is asking authors to paste the shared discipline
// blocks into every skill and then linting that the copies stay byte identical.
// That is a build step performed by a linter. Here the author declares which
// blocks they need and the compiler writes them, so the standard is defined
// once and every installed skill still stands alone with no runtime dependency.
//
// Pure: skill in, markdown out. Compiling is deterministic and idempotent.

import {
  FAMILIES,
  TRAILING_FAMILY,
  STANDARD_VERSION,
  familyById,
  parseDeclaration,
} from './standard/index.mjs';

const openMarker = (version) => `<!-- agentic:standard ${version} -->`;
const CLOSE_MARKER = '<!-- /agentic:standard -->';

/** Values are quoted only when leaving them bare would change how they parse. */
function serializeValue(value) {
  const needsQuotes =
    value === '' || value.includes(':') || value !== value.trim() || /^["']/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function serializeFrontmatter(frontmatter) {
  const lines = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== null && typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        lines.push(`  ${nestedKey}: ${serializeValue(String(nestedValue))}`);
      }
      continue;
    }
    lines.push(`${key}: ${serializeValue(String(value))}`);
  }
  return lines.join('\n');
}

function wrap(blocks, version) {
  return `${openMarker(version)}\n\n${blocks.join('\n\n')}\n\n${CLOSE_MARKER}`;
}

/**
 * Compile a parsed skill into its installable form.
 *
 * A skill with no `standard:` block compiles to itself, which is what makes
 * this idempotent: recompiling already compiled output is a no op rather than a
 * second round of injection.
 *
 * @param {object} skill parsed by parseSkill
 * @param {{standardVersion?: string}} options
 * @returns {string} the markdown to write
 */
export function compile(skill, { standardVersion = STANDARD_VERSION } = {}) {
  const { declaration } = parseDeclaration(skill);

  const emitted = { ...skill.frontmatter };
  delete emitted.standard;

  const preamble = FAMILIES.filter((family) => family.id !== TRAILING_FAMILY)
    .map((family) => (declaration[family.id] ? family.block(declaration[family.id]) : null))
    .filter(Boolean);

  const trailingLevel = declaration[TRAILING_FAMILY];
  const trailing = trailingLevel ? familyById(TRAILING_FAMILY).block(trailingLevel) : null;

  let body = skill.body;
  if (preamble.length > 0) {
    body = `\n${wrap(preamble, standardVersion)}\n${body}`;
  }
  if (trailing) {
    body = `${body.replace(/\s+$/, '')}\n\n${wrap([trailing], standardVersion)}\n`;
  }

  return `---\n${serializeFrontmatter(emitted)}\n---\n${body}`;
}
