// The shape of the codebase, so new code lands in the right layer.

export const id = 'architecture';
export const number = 5;
export const title = 'Architecture';
export const when = () => true;

export function text(signals) {
  return `# 5. Architecture

{{ARCHITECTURE_OVERVIEW}}

Layers:

{{ARCHITECTURE_LAYERS}}

Put new code in the layer that already owns that responsibility. Do not add
a second way to do something a layer already does.`;
}
