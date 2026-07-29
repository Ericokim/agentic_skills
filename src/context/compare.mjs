// What would change, at the level a person reads.
//
// A line diff of a 20 KB file is unreadable and nobody checks it. Comparing top
// level headings answers the question that matters before overwriting anything:
// what would I gain, and what would I lose.

const headings = (markdown) =>
  markdown
    .split('\n')
    .map((line) => /^#\s+(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => match[1].trim());

/**
 * @param {string} existing
 * @param {string} generated
 * @returns {{added: string[], removed: string[], kept: number}}
 */
export function compare(existing, generated) {
  const before = new Set(headings(existing));
  const after = new Set(headings(generated));
  return {
    added: [...after].filter((h) => !before.has(h)),
    removed: [...before].filter((h) => !after.has(h)),
    kept: [...after].filter((h) => before.has(h)).length,
  };
}
