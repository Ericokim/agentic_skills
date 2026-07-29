// The section list, and selection against a profile.
//
// A section owns its text and its predicate in one file, the same shape as a
// rule family in src/standard/. Splitting them is how a section ends up
// claiming to apply in a case its text does not cover.

import * as dataPlatform from './sections/data-platform.mjs';
import * as product from './sections/product.mjs';
import * as techStack from './sections/tech-stack.mjs';

/**
 * Array order is the document order. Unnumbered blocks are placed by position in
 * this array rather than by a sort, because some belong before section 1 and others
 * after section 23.
 */
export const SECTIONS = [product, techStack, dataPlatform];

/**
 * Which sections this repository gets, and why the rest were left out.
 *
 * A section that does not apply is absent rather than filled with Unknown, and
 * the reason is reported so nobody has to guess whether it was skipped or
 * missed.
 */
export function selectSections({ signals }) {
  const included = [];
  const skipped = [];
  for (const section of SECTIONS) {
    if (section.when(signals)) included.push(section);
    else skipped.push({ id: section.id, title: section.title, reason: `requires ${section.requires ?? 'evidence this section applies'}` });
  }
  return { included, skipped };
}
