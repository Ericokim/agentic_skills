// Selected sections plus known values to one flat markdown file.
//
// One file, deliberately. A tiered split would cut the always loaded size, but
// it costs a reader the ability to open one file and see the whole contract,
// and it makes every skill's instruction to read AGENTS.md only partly true.

import { selectSections } from './registry.mjs';

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

/**
 * @param {{profileResult: object, values: Record<string,string>}} input
 * @returns {{markdown: string, open: {name: string, section: string}[], skipped: object[], bytes: number}}
 */
export function assemble({ profileResult, values = {} }) {
  const { included, skipped } = selectSections(profileResult);
  const open = [];
  const seen = new Set();

  const bodies = included.map((section) => {
    const filled = section.text(profileResult.signals).replace(PLACEHOLDER, (match, name) => {
      if (Object.hasOwn(values, name)) return values[name];
      if (!seen.has(name)) {
        seen.add(name);
        open.push({ name, section: section.id });
      }
      return match;
    });
    return filled.trim();
  });

  const markdown = `${bodies.join('\n\n---\n\n')}\n`;
  return { markdown, open, skipped, bytes: Buffer.byteLength(markdown, 'utf8') };
}
