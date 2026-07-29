// Parses a SKILL.md into frontmatter, body, and structure.
//
// Pure: string in, object out. No filesystem, no network. Every other stage of
// the pipeline consumes what this produces, so the shape it returns is the
// contract the validator and compiler are written against.
//
// The frontmatter subset is deliberately small (scalars, one level of nesting,
// comments). A skill's frontmatter is an interface, not a config language; if a
// skill needs a construct this parser rejects, the skill is doing too much.

export class SkillParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkillParseError';
  }
}

const FENCE = '---';

/** Split a document into its frontmatter lines and its body. */
function splitFrontmatter(source) {
  const text = source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  if (lines[0]?.trim() !== FENCE) {
    throw new SkillParseError(
      'missing frontmatter: a SKILL.md must open with a --- fence on line 1',
    );
  }

  const close = lines.indexOf(FENCE, 1);
  if (close === -1) {
    throw new SkillParseError('unterminated frontmatter: no closing --- fence');
  }

  return {
    frontmatterLines: lines.slice(1, close),
    body: lines.slice(close + 1).join('\n'),
  };
}

/** Strip one matching pair of surrounding quotes. */
function unquote(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.endsWith(first) && trimmed.length > 1) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse the restricted frontmatter dialect.
 *
 * `key: value` at column 0, and `  key: value` indented under a key whose value
 * was empty. Anything else is an error with a line number, because a silently
 * dropped frontmatter key is exactly the kind of thing that makes an installed
 * skill behave differently from the one that was authored.
 */
function parseFrontmatter(lines) {
  const out = {};
  let currentKey = null;

  lines.forEach((raw, index) => {
    const lineNumber = index + 2; // +1 for zero index, +1 for the opening fence
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trim().startsWith('#')) return;

    const indented = /^\s+/.test(line);
    const colon = line.indexOf(':');
    if (colon === -1) {
      throw new SkillParseError(
        `malformed frontmatter at line ${lineNumber}: expected "key: value", got ${JSON.stringify(line)}`,
      );
    }

    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();

    if (indented) {
      if (currentKey === null) {
        throw new SkillParseError(
          `malformed frontmatter at line ${lineNumber}: indented entry with no parent key`,
        );
      }
      if (typeof out[currentKey] !== 'object') {
        throw new SkillParseError(
          `malformed frontmatter at line ${lineNumber}: "${currentKey}" already has a value, so it cannot also have nested entries`,
        );
      }
      out[currentKey][key] = unquote(value);
      return;
    }

    if (value === '') {
      out[key] = {};
      currentKey = key;
      return;
    }

    out[key] = unquote(value);
    currentKey = key;
  });

  return out;
}

/** Every markdown heading in the body, in document order. */
function headings(body) {
  return body
    .split('\n')
    .map((line) => /^#{1,6}\s+(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => match[1].trim());
}

/**
 * Parse a SKILL.md.
 *
 * @param {string} source raw file contents
 * @returns {{frontmatter: object, body: string, sections: string[], tools: string[]}}
 */
export function parseSkill(source) {
  const { frontmatterLines, body } = splitFrontmatter(source);
  const frontmatter = parseFrontmatter(frontmatterLines);

  const rawTools = frontmatter['allowed-tools'];
  const tools =
    typeof rawTools === 'string' && rawTools.trim() !== ''
      ? rawTools.split(',').map((tool) => tool.trim()).filter(Boolean)
      : [];

  return { frontmatter, body, sections: headings(body), tools };
}
