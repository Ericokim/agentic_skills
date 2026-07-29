// Bundled files, shared by every target that can carry them.
//
// A skill's instructions reference these by relative path ("read
// modes/verify.md and follow it"). Installing the SKILL.md without them
// installs a skill that tells the agent to open a file that is not there, and
// nothing errors: the agent simply improvises, which is the failure this whole
// project exists to prevent.

/** Append bundled files to a target's planned output, under the skill dir. */
export function withAssets(files, dir, assets = []) {
  return [
    ...files,
    ...assets.map((asset) => ({ path: `${dir}/${asset.relative}`, contents: asset.contents })),
  ];
}
