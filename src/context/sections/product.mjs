// What this project is for, and what it deliberately does not do.

export const id = 'product';
export const number = 1;
export const title = 'Product';
export const when = () => true;

export function text() {
  return `# 1. Product

{{PRODUCT_SUMMARY}}

Build only:

{{CORE_FEATURES}}

Do not overbuild.

Explicitly out of scope:

{{OUT_OF_SCOPE}}`;
}
