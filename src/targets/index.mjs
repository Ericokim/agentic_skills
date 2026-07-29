// Target adapters: where an installed skill goes, and in what dialect.
//
// Targets are deliberately the thinnest layer in the pipeline. Every agent tool
// reads the same compiled markdown; they disagree only about the path and the
// frontmatter shape. Keeping validation and compilation out of here is what
// stops a fix to the evidence rule needing four edits.
//
// Pure: a target plans files, it does not write them. The caller owns the disk.

import * as aiderDesk from './aider-desk.mjs';
import * as astrbot from './astrbot.mjs';
import * as augment from './augment.mjs';
import * as autohand from './autohand.mjs';
import * as bob from './bob.mjs';
import * as claudeCode from './claude-code.mjs';
import * as codearts from './codearts.mjs';
import * as codex from './codex.mjs';
import * as cursor from './cursor.mjs';
import * as generic from './generic.mjs';
import * as openclaw from './openclaw.mjs';

export const TARGETS = [
  claudeCode,
  codex,
  generic,
  cursor,
  aiderDesk,
  augment,
  autohand,
  bob,
  codearts,
  openclaw,
  astrbot,
];

export const DEFAULT_TARGET = claudeCode.id;

export function targetById(id) {
  return TARGETS.find((target) => target.id === id);
}

/**
 * Plan the files one target would write for one skill.
 *
 * @param {string} targetId
 * @param {{root: string, name: string, compiled: string, skill: object}} context
 * @returns {Array<{path: string, contents: string}>}
 */
export function planEmit(targetId, context) {
  const target = targetById(targetId);
  if (!target) {
    throw new Error(
      `unknown target "${targetId}", so use one of ${TARGETS.map((t) => t.id).join(', ')}`,
    );
  }
  return target.plan(context);
}

/**
 * Directories that, if present, suggest a target is in use in this project.
 *
 * At most one target per directory. Two targets writing the same path would
 * plan the same file twice, so a target that shares a directory with another
 * sets `detect` to null and is chosen explicitly instead.
 */
export function detectionHints() {
  return TARGETS.filter((target) => target.detect).map((target) => ({
    id: target.id,
    dir: target.detect,
  }));
}
