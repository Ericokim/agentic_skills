import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assemble } from '../context/assemble.mjs';
import { compare } from '../context/compare.mjs';
import { prefill } from '../context/prefill.mjs';
import { profile as buildProfile } from '../context/profile.mjs';
import { takeSnapshot } from '../context/snapshot.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Plan a context file: select sections, pre-fill facts, and say what is left.
 *
 * Writes a draft and a brief. Never writes AGENTS.md, because a context file a
 * person curated is worth more than one a tool generated.
 */
export async function context({ root, plan = true }) {
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

  line(`${symbol.ok} ${bold('AGENTS.draft.md')} ${dim(`${kb(bytes)}, ~${Math.round(bytes / 4 / 100) / 10}k tokens`)}`);
  line(`  ${dim(`${Object.keys(values).length} fields pre-filled, ${open.length} need an answer, ${skipped.length} sections skipped`)}`);

  const existing = await readIfPresent(join(root, 'AGENTS.md'));
  if (existing) {
    const diff = compare(existing, markdown);
    line();
    line(`  ${dim('against your existing AGENTS.md:')}`);
    line(`    ${diff.added.length} sections added, ${diff.removed.length} removed, ${diff.kept} kept`);
    for (const heading of diff.removed) line(`    ${symbol.warn} would lose: ${heading}`);
    line(`  ${dim('your AGENTS.md was not modified')}`);
  }
  return 0;
}
