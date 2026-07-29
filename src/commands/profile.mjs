import { profile as buildProfile } from '../context/profile.mjs';
import { takeSnapshot } from '../context/snapshot.mjs';
import { bold, dim, line, symbol, table } from '../ui.mjs';

/** Print what was detected and the file that proved it. */
export async function profile({ root }) {
  const snapshot = await takeSnapshot(root);
  if (snapshot.paths.length === 0) {
    line(`${symbol.fail} nothing readable at ${root}`);
    return 1;
  }

  const { signals } = buildProfile(snapshot);
  const rows = [[dim('SIGNAL'), dim('DETECTED'), dim('EVIDENCE')]];
  for (const [id, signal] of Object.entries(signals)) {
    rows.push([
      bold(id),
      signal.present ? `${symbol.ok} yes` : dim('no'),
      signal.evidence.slice(0, 2).join(', ') || dim('-'),
    ]);
  }
  line();
  table(rows);
  line();
  return 0;
}
