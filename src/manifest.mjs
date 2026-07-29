// skills.json: the intent. What this project wants installed, and where.
//
// Hand editable on purpose. The manifest is the file a person reads to answer
// "what discipline does this repo run under"; the lockfile beside it is the
// machine's answer to "what is actually on disk".

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { STANDARD_VERSION } from './standard/index.mjs';
import { DEFAULT_TARGET } from './targets/index.mjs';

export const MANIFEST_FILE = 'skills.json';

export function defaultManifest({ targets = [DEFAULT_TARGET] } = {}) {
  return { standard: STANDARD_VERSION, targets, promptFirst: false, skills: {} };
}

export async function readManifest(root) {
  const path = join(root, MANIFEST_FILE);
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${MANIFEST_FILE} is not valid json (${path}): ${error.message}`);
  }
}

export async function writeManifest(root, manifest) {
  await writeFile(join(root, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** Skills stay sorted so a manifest diff shows the change, not a reshuffle. */
function sortSkills(skills) {
  return Object.fromEntries(Object.entries(skills).sort(([a], [b]) => a.localeCompare(b)));
}

export function setSkill(manifest, name, spec) {
  return { ...manifest, skills: sortSkills({ ...manifest.skills, [name]: spec }) };
}

export function removeSkill(manifest, name) {
  const skills = { ...manifest.skills };
  delete skills[name];
  return { ...manifest, skills: sortSkills(skills) };
}
