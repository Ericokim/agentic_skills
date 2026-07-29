import { detectDrift } from '../install.mjs';
import { readLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest } from '../manifest.mjs';
import { STANDARD_VERSION } from '../standard/index.mjs';
import { bold, dim, line, symbol } from '../ui.mjs';

/**
 * Report every way the installed state disagrees with the declared state.
 *
 * Reports only. Nothing here writes, because each finding has more than one
 * right answer and picking one on the engineer's behalf is how a tool loses an
 * afternoon of somebody's work.
 */
export async function doctor({ root }) {
  const manifest = await readManifest(root);
  if (!manifest) {
    line(`${symbol.fail} no ${MANIFEST_FILE} here, so run ${bold('agentic init')} first.`);
    return 1;
  }

  const lock = await readLock(root);
  const findings = [];

  for (const [name, spec] of Object.entries(manifest.skills)) {
    const entry = lock[name];
    if (!entry) {
      findings.push({ name, message: `declared in ${MANIFEST_FILE} but never installed`, fix: 'agentic add' });
      continue;
    }
    if (entry.resolved !== spec) {
      findings.push({
        name,
        message: `manifest asks for ${spec}, lock has ${entry.resolved}`,
        fix: `agentic update ${name}`,
      });
    }
    if (entry.standard !== STANDARD_VERSION) {
      findings.push({
        name,
        message: `compiled against standard ${entry.standard}, current is ${STANDARD_VERSION}`,
        fix: `agentic update ${name}`,
      });
    }
    for (const drift of await detectDrift(root, entry)) {
      findings.push({
        name,
        message:
          drift.reason === 'missing'
            ? `installed file is gone: ${drift.path}`
            : `installed file was edited by hand: ${drift.path}`,
        fix: drift.reason === 'missing' ? 'agentic add' : `agentic add --force`,
      });
    }
  }

  for (const name of Object.keys(lock)) {
    if (!manifest.skills[name]) {
      findings.push({
        name,
        message: `installed but not declared in ${MANIFEST_FILE}`,
        fix: `agentic remove ${name}`,
      });
    }
  }

  if (findings.length === 0) {
    const count = Object.keys(manifest.skills).length;
    line(
      `${symbol.ok} everything matches: ${count} ${count === 1 ? 'skill' : 'skills'}, standard ${STANDARD_VERSION}`,
    );
    return 0;
  }

  line(`${symbol.warn} ${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`);
  line();
  for (const finding of findings) {
    line(`  ${bold(finding.name)}  ${finding.message}`);
    line(`    ${dim(`fix: ${finding.fix}`)}`);
  }
  return 1;
}
