// How raw input becomes structured data before anything downstream sees it.

export const id = 'input-extraction';
export const number = 11;
export const title = 'Input extraction';
export const when = (signals) => signals.backgroundWork.present;
export const requires = 'background work';

export function text(signals) {
  return `# 11. Input extraction

{{INPUT_EXTRACTION_RULES}}

- Validate the raw input before extracting anything from it.
- Treat a malformed item as a skip with a logged reason, not a crash.
- Keep extraction free of side effects; it should produce data, not write
  it.`;
}
