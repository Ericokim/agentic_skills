import { detectDrift } from '../install.mjs';
import { readLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest } from '../manifest.mjs';
import { STANDARD_VERSION } from '../standard/index.mjs';
import { bold, cyan, dim, line, symbol, table, yellow } from '../ui.mjs';

export async function list({ root }) {
  const manifest = await readManifest(root);
  if (!manifest) {
    line(`${symbol.warn} no ${MANIFEST_FILE} here, so run ${bold('agentic init')} first.`);
    return 1;
  }

  const names = Object.keys(manifest.skills);
  if (names.length === 0) {
    line(`${dim('no skills installed')}`);
    line(`${symbol.arrow} add one: ${bold('agentic add <source>')}`);
    return 0;
  }

  const lock = await readLock(root);
  const rows = [[dim('SKILL'), dim('SOURCE'), dim('STANDARD'), dim('STATUS')]];

  for (const name of names) {
    const entry = lock[name];
    let status = dim('not installed');
    if (entry) {
      const drift = await detectDrift(root, entry);
      if (drift.some((d) => d.reason === 'edited')) status = yellow('edited locally');
      else if (drift.some((d) => d.reason === 'missing')) status = yellow('files missing');
      else if (entry.standard !== STANDARD_VERSION) status = yellow(`standard ${entry.standard}`);
      else status = `${symbol.ok} ok`;
    }
    rows.push([bold(name), cyan(manifest.skills[name]), entry?.standard ?? dim('-'), status]);
  }

  line();
  table(rows);
  line();
  line(dim(`targets: ${manifest.targets.join(', ')}  ${symbol.bullet}  standard ${STANDARD_VERSION}`));
  return 0;
}
