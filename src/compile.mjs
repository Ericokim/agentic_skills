// Compiles a skill source into the self contained skill that gets installed.
//
// This is why this repo exists. The alternative, which the projects we mapped
// from all settle for, is asking authors to paste the shared discipline blocks
// into every skill and then linting that the copies stay byte identical. That is
// a build step performed by a linter. Here the author declares which blocks they
// need and the compiler writes them, so the standard is defined once and every
// installed skill still stands alone with no runtime dependency.
//
// Pure: skill in, markdown out. Compiling is deterministic and idempotent.
//
// Two callers want two slightly different files. An installer wants the
// declaration gone, because it is compile time metadata that means nothing to
// an agent. The build step wants it kept, because it writes back over the file
// it just read and the declaration is the only part a person authors. Both use
// the same injection, so the installed skill and the committed one can never
// disagree about what the rules say.

import {
  FAMILIES,
  TRAILING_FAMILY,
  STANDARD_VERSION,
  familyById,
  parseDeclaration,
} from './standard/index.mjs';

const openMarker = (version) => `<!-- agentic:standard ${version} -->`;
const CLOSE_MARKER = '<!-- /agentic:standard -->';

/**
 * A previously injected region, marker to marker, plus the newline that
 * separates it from the prose either side.
 *
 * Stripping these before injecting is what lets one file be both the source and
 * the thing an installer reads: compiling a file that already carries its
 * blocks replaces them rather than appending a second copy. The surrounding
 * newlines are part of the match so a round trip returns the exact body the
 * author wrote, which is the property `build --check` depends on.
 */
const REGION = /\n?<!--\s*agentic:standard\s[^\n]*-->\n[\s\S]*?\n<!--\s*\/agentic:standard\s*-->\n/g;

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
 * The body with every declared block injected, and any previously injected
 * block replaced rather than duplicated.
 *
 * A skill with no `standard:` block compiles to itself, which is what makes
 * this idempotent: recompiling already compiled output is a no op rather than a
 * second round of injection.
 */
function injectBody(skill, standardVersion) {
  const { declaration } = parseDeclaration(skill);

  const preamble = FAMILIES.filter((family) => family.id !== TRAILING_FAMILY)
    .map((family) => (declaration[family.id] ? family.block(declaration[family.id]) : null))
    .filter(Boolean);

  const trailingLevel = declaration[TRAILING_FAMILY];
  const trailing = trailingLevel ? familyById(TRAILING_FAMILY).block(trailingLevel) : null;

  let body = skill.body;
  if (preamble.length > 0 || trailing) body = body.replace(REGION, '');
  if (preamble.length > 0) {
    body = `\n${wrap(preamble, standardVersion)}\n${body}`;
  }
  if (trailing) {
    body = `${body.replace(/\s+$/, '')}\n\n${wrap([trailing], standardVersion)}\n`;
  }

  return body;
}

const render = (frontmatter, body) => `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;

/**
 * Compile a parsed skill into its installable form, with the declaration
 * stripped because it is compile time metadata an agent has no use for.
 *
 * @param {object} skill parsed by parseSkill
 * @param {{standardVersion?: string}} options
 * @returns {string} the markdown to write
 */
export function compile(skill, { standardVersion = STANDARD_VERSION } = {}) {
  const emitted = { ...skill.frontmatter };
  delete emitted.standard;
  return render(emitted, injectBody(skill, standardVersion));
}

/**
 * Compile a parsed skill back over itself, keeping the declaration.
 *
 * This is what `agentic build` writes. The declaration stays because it is the
 * part a person authors and the next build has to read it again; the injected
 * blocks are regenerated in place. Running it twice over its own output
 * produces the same bytes, which is the whole basis of `build --check`.
 */
export function compileInPlace(skill, { standardVersion = STANDARD_VERSION } = {}) {
  return render(skill.frontmatter, injectBody(skill, standardVersion));
}
