import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assemble } from '../context/assemble.mjs';
import { compare } from '../context/compare.mjs';
import { prefill } from '../context/prefill.mjs';
import { profile as buildProfile } from '../context/profile.mjs';
import { takeSnapshot } from '../context/snapshot.mjs';
import { verifyAnswers } from '../context/verify.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const tokenEstimate = (bytes) => Math.round(bytes / 4 / 100) / 10;
const sizeReport = (bytes) => `${bytes} bytes, ${kb(bytes)}, ~${tokenEstimate(bytes)}k tokens`;

/**
 * Merge verified answers underneath the facts the CLI already pre-filled.
 *
 * Prefilled wins on conflict: the CLI read that value itself, off a manifest
 * or a lockfile, and a model does not get to overwrite something this program
 * already knows to be true. Every collision is named, because a silently
 * dropped answer is exactly the kind of thing that looks like a bug later.
 */
function mergeOverPrefill(accepted, prefilled) {
  const overridden = Object.keys(accepted).filter((name) => Object.hasOwn(prefilled, name));
  return { values: { ...accepted, ...prefilled }, overridden };
}

/** Print how `markdown` would differ from an existing AGENTS.md, at heading level. */
function reportComparison(existing, markdown) {
  const diff = compare(existing, markdown);
  line();
  line(`  ${dim('against your existing AGENTS.md:')}`);
  line(`    ${diff.added.length} sections added, ${diff.removed.length} removed, ${diff.kept} kept`);
  for (const heading of diff.removed) line(`    ${symbol.warn} would lose: ${heading}`);
  line(`  ${dim('your AGENTS.md was not modified')}`);
}

/**
 * Phase 2: verify a model's answers against the repository and emit
 * AGENTS.generated.md.
 *
 * This is the mechanical half of generation. `verifyAnswers` re-reads every
 * citation itself; nothing here trusts a value that citation does not
 * actually contain. A downgraded field is reported loudly, because that is
 * this command telling its caller a claim could not be backed, and CI needs
 * to be able to gate on it: the exit code is 1 whenever that happens.
 */
async function generate({ root, answersPath }) {
  let raw;
  try {
    raw = await readFile(answersPath, 'utf8');
  } catch (error) {
    line(`${symbol.fail} could not read ${answersPath}: ${error.message}`);
    return 1;
  }

  let answers;
  try {
    answers = JSON.parse(raw);
  } catch (error) {
    line(`${symbol.fail} ${answersPath} is not valid JSON: ${error.message}`);
    return 1;
  }

  const snapshot = await takeSnapshot(root);
  if (snapshot.paths.length === 0) {
    line(`${symbol.fail} nothing readable at ${root}`);
    return 1;
  }

  const profileResult = buildProfile(snapshot);
  const prefilled = prefill(profileResult);
  const reader = (path) => readIfPresent(join(root, path));
  const { accepted, downgraded } = await verifyAnswers(answers, reader);
  const { values, overridden } = mergeOverPrefill(accepted, prefilled);
  const { markdown, open, skipped, bytes } = assemble({ profileResult, values });

  await writeFile(join(root, 'AGENTS.generated.md'), markdown, 'utf8');

  const answered = Object.keys(answers).length;
  const verified = answered - downgraded.length;
  const ok = downgraded.length === 0;

  line(`${ok ? symbol.ok : symbol.fail} ${bold('AGENTS.generated.md')} ${dim(sizeReport(bytes))}`);
  line(
    `  ${dim(`${verified}/${answered} answer${answered === 1 ? '' : 's'} verified, ${open.length} placeholder${open.length === 1 ? '' : 's'} still open, ${skipped.length} sections skipped`)}`,
  );

  if (overridden.length > 0) {
    line(
      `  ${symbol.warn} ${overridden.length} answer${overridden.length === 1 ? '' : 's'} collided with a fact the CLI already knew, and the CLI's value won: ${overridden.join(', ')}`,
    );
  }

  if (!ok) {
    line();
    line(
      `${symbol.fail} ${bold(`${downgraded.length} field${downgraded.length === 1 ? '' : 's'} downgraded to Unknown`)} ${dim('- the claim could not be backed by its citation:')}`,
    );
    for (const item of downgraded) {
      line(`    ${symbol.fail} ${bold(item.name)}: ${item.reason}`);
    }
  }

  const existing = await readIfPresent(join(root, 'AGENTS.md'));
  if (existing) reportComparison(existing, markdown);

  return ok ? 0 : 1;
}

/**
 * Plan a context file: select sections, pre-fill facts, and say what is left.
 *
 * Writes a draft and a brief. Never writes AGENTS.md, because a context file a
 * person curated is worth more than one a tool generated. Pass `answers`, a
 * path to a JSON answers file shaped like `verifyAnswers` takes, to run phase
 * 2 instead: verify those answers against the repository and write
 * AGENTS.generated.md.
 */
export async function context({ root, plan = true, answers = null }) {
  if (answers) return generate({ root, answersPath: answers });

  const snapshot = await takeSnapshot(root);
  if (snapshot.paths.length === 0) {
    line(`${symbol.fail} nothing readable at ${root}`);
    return 1;
  }

  const profileResult = buildProfile(snapshot);
  const values = prefill(profileResult);
  const { markdown, open, skipped, bytes } = assemble({ profileResult, values });

  const brief = [
    '# Generation brief',
    '',
    `${open.length} placeholders need an answer. Each answer must cite a file,`,
    'in the form `NAME: value` followed by `  evidence: path:line`.',
    '',
    ...open.map((item) => `- \`${item.name}\`  (section: ${item.section})`),
    '',
    '## Sections skipped, and why',
    '',
    ...skipped.map((item) => `- ${item.title}: ${item.reason}`),
    '',
  ].join('\n');

  await writeFile(join(root, 'AGENTS.draft.md'), markdown, 'utf8');
  await writeFile(join(root, 'AGENTS.brief.md'), brief, 'utf8');

  line(`${symbol.ok} ${bold('AGENTS.draft.md')} ${dim(`${kb(bytes)}, ~${tokenEstimate(bytes)}k tokens`)}`);
  line(`  ${dim(`${Object.keys(values).length} fields pre-filled, ${open.length} need an answer, ${skipped.length} sections skipped`)}`);

  const existing = await readIfPresent(join(root, 'AGENTS.md'));
  if (existing) reportComparison(existing, markdown);
  return 0;
}
