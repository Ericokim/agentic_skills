// What this project is for, and what it deliberately does not do.

export const id = 'product';
export const number = 1;
export const title = 'Product';
export const when = () => true;

// The text() function signature is uniform across all sections: they all receive
// signals so a section can vary its wording based on what the project has. Most
// sections ignore the argument, but the signature must be consistent.
export function text(signals) {
  return `# 1. Product

{{PRODUCT_SUMMARY}}

Build only:

{{CORE_FEATURES}}

Do not overbuild.

Explicitly out of scope:

{{OUT_OF_SCOPE}}`;
}
