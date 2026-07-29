// The stack, taken from manifests rather than from what the code looks like.

export const id = 'tech-stack';
export const number = 6;
export const title = 'Tech stack';
export const when = () => true;

export function text() {
  return `# 6. Tech stack

{{STACK_TABLE}}

Package manager: {{PACKAGE_MANAGER}}

Before writing framework specific code, inspect the installed version and read
the local documentation for it. Do not rely on memory alone.`;
}
