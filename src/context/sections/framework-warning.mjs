// Stops an agent from importing generic framework habits that do not hold here.

export const id = 'framework-warning';
export const number = null;
export const title = 'Framework warning';
export const when = () => true;

export function text(signals) {
  return `## Before you assume anything

Frameworks and libraries carry conventions from their own documentation and
tutorials. This repository may use a subset of them, override some, or use
none at all. Read the code in this repository before applying a pattern you
remember from elsewhere, and prefer what the code already does over what a
framework's own docs suggest.`;
}
