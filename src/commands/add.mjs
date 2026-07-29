import { join } from 'node:path';

import { resolveSource } from '../fetch.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { discoverSkills, installOne } from '../install.mjs';
import { readLock, writeLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest, setSkill, writeManifest } from '../manifest.mjs';
import { parseSkill } from '../skill.mjs';
import { parseSource } from '../source.mjs';
import { bold, dim, line, reportViolations, symbol } from '../ui.mjs';
import { frameBar, frameClose, frameOpen, frameStep } from '../ui/frame.mjs';
import { pickSkills } from '../ui/picker.mjs';

/**
 * What "add <source>" actually installs.
 *
 * A source spec can point straight at one skill or at a directory holding
 * many, and --only narrows a multi-skill source to a chosen subset. Deciding
 * that once, before the install loop starts, is what lets the loop stay a
 * single shape whether it ends up installing one skill or nine. An explicit
 * --name always wins outright: it is how someone picks one skill out of a
 * multi-skill source today, and that has to keep working unchanged.
 */
async function planRequests({ spec, name, only, cacheDir, cwd }) {
  if (name) return { requests: [{ spec, name }] };

  const source = parseSource(spec);
  const { dir } = await resolveSource(source, { cacheDir, cwd });
  const searchDir = source.subpath ? join(dir, source.subpath) : dir;
  const found = await discoverSkills(searchDir);

  if (found.length === 0) return { requests: [{ spec, name: null }], found };

  let selected = found;
  if (only) {
    const wanted = only.split(',').map((n) => n.trim()).filter(Boolean);
    const available = new Set(found.map((skill) => skill.name));
    const unknown = wanted.filter((n) => !available.has(n));
    if (unknown.length > 0) {
      return {
        error: `--only names ${unknown.join(', ')}, which this source does not provide, and this source provides: ${found.map((skill) => skill.name).join(', ')}`,
      };
    }
    selected = found.filter((skill) => wanted.includes(skill.name));
  }

  return { requests: selected.map((skill) => ({ spec: skill.path, name: skill.name })), found };
}

/**
 * Descriptions to show the picker, one per discovered skill.
 *
 * Reads each skill's frontmatter straight off disk rather than threading it
 * through prepareInstall, because the picker has to show every discovered
 * skill's description before any of them are actually resolved and compiled.
 * A skill whose SKILL.md cannot be read or parsed shows an empty description
 * instead of taking the whole picker down with it.
 */
async function skillDescriptions(found) {
  const items = [];
  for (const skill of found) {
    let description = '';
    try {
      const contents = await readIfPresent(join(skill.path, 'SKILL.md'));
      if (contents !== null) {
        const parsed = parseSkill(contents);
        if (typeof parsed.frontmatter.description === 'string') {
          description = parsed.frontmatter.description;
        }
      }
    } catch {
      description = '';
    }
    items.push({ name: skill.name, description });
  }
  return items;
}

/**
 * Install one skill, every skill in the manifest when no spec is given, or
 * every skill a multi-skill source provides.
 *
 * Validation runs before anything is written, and a skill that fails is
 * reported and skipped with a non zero exit, so a CI run that installs skills
 * fails loudly rather than shipping a skill that lies.
 */
export async function add({
  root,
  spec,
  name,
  only,
  targets,
  cacheDir,
  dryRun,
  force,
  cwd,
  all = false,
  interactive = false,
}) {
  const manifest = await readManifest(root);
  if (!manifest) {
    line(`${symbol.fail} no ${MANIFEST_FILE} here, so run ${bold('agentic init')} first.`);
    return 1;
  }

  let requests;
  let found;
  if (spec) {
    const planned = await planRequests({ spec, name, only, cacheDir, cwd });
    if (planned.error) {
      line(`${symbol.fail} ${planned.error}`);
      return 1;
    }
    ({ requests, found } = planned);
  } else {
    requests = Object.entries(manifest.skills).map(([key, value]) => ({ spec: value, name: key }));
  }

  // A source that offers a choice gets one, in a terminal, unless the caller
  // already said what it wants via --only, --name, or --all. Cancelling out
  // of the picker installs nothing and still exits clean: a person browsing
  // and changing their mind is not an error.
  //
  // Whether stdin and stdout are actually a terminal is decided once by the
  // CLI entry point, the one place that legitimately reads ambient process
  // state, and handed down as `interactive`. add() never reads
  // process.stdin/process.stdout itself, and a caller that omits
  // `interactive` gets the safe, non-blocking default of false.
  if (found && found.length > 1 && !only && !name && !all && interactive) {
    const items = await skillDescriptions(found);

    line(frameOpen('agentic'));
    line(frameBar());
    line(frameStep(`Source: ${spec}`));
    line(frameBar());
    line(frameStep('Repository cloned'));
    line(frameBar());
    line(frameStep(`Found ${found.length} ${found.length === 1 ? 'skill' : 'skills'}`));

    const chosen = await pickSkills(items);
    line(frameClose());

    if (chosen === null || chosen.length === 0) {
      line(`${symbol.warn} cancelled: nothing installed`);
      return 0;
    }
    const chosenNames = new Set(chosen);
    requests = requests.filter((request) => chosenNames.has(request.name));
  }

  if (requests.length === 0) {
    line(`${symbol.warn} nothing to install: ${MANIFEST_FILE} lists no skills.`);
    return 0;
  }

  // A source that provides many skills gets a count up front and a tighter
  // per-skill line, so installing nine reads as one report instead of nine
  // repetitions of the same source string.
  const multi = Boolean(found && found.length > 0);
  if (multi) {
    line(`Found ${found.length} ${found.length === 1 ? 'skill' : 'skills'} in ${spec}`);
    line();
  }
  const nameWidth = multi ? Math.max(...requests.map((r) => (r.name ?? '').length)) : 0;

  const lock = await readLock(root);
  const targetList = targets.length > 0 ? targets : manifest.targets;
  let updated = manifest;
  let failures = 0;

  for (const request of requests) {
    const result = await installOne({
      root,
      name: request.name,
      spec: request.spec,
      targets: targetList,
      cacheDir,
      cwd,
      lock,
      force,
      dryRun,
    });

    switch (result.status) {
      case 'error':
        line(`${symbol.fail} ${bold(result.name)}  ${result.message}`);
        failures += 1;
        break;

      case 'invalid':
        reportViolations(
          `${bold(result.name)} does not meet the standard, so it was not installed`,
          result.violations,
        );
        failures += 1;
        break;

      case 'blocked':
        line(`${symbol.warn} ${bold(result.name)} has local edits, so it was left alone:`);
        for (const file of result.edited) line(`    ${dim(file.path)}`);
        line(`    ${dim('reinstall over them with --force')}`);
        failures += 1;
        break;

      case 'planned':
        line(`${symbol.ok} ${bold(result.name)} ${dim('(dry run, nothing written)')}`);
        for (const file of result.prepared.files) {
          line(`    ${dim(file.path.replace(`${root}/`, ''))}`);
        }
        break;

      default: {
        lock[result.name] = result.entry;
        updated = setSkill(updated, result.name, result.prepared.source.toString());
        const count = result.prepared.files.length;
        const where = count === 1 ? '1 file' : `${count} files`;
        // A multi-skill install already said where it came from once, in the
        // "Found N skills in <source>" line above, so each row here only
        // needs the name and what landed.
        line(
          multi
            ? `${symbol.ok} ${bold(result.name.padEnd(nameWidth))}  ${where}`
            : `${symbol.ok} ${bold(result.name)} ${dim(`${result.prepared.source} ${symbol.bullet} ${where}`)}`,
        );
        // A target that cannot carry bundled files installs this skill
        // incomplete. Say so now, rather than leaving it to be discovered when
        // an agent cannot find a file its instructions told it to read.
        for (const drop of result.prepared.droppedAssets ?? []) {
          line(
            `    ${symbol.warn} ${dim(`${drop.target} cannot carry bundled files, so ${drop.count} were left out and this skill will be incomplete there`)}`,
          );
        }
      }
    }
  }

  if (!dryRun) {
    await writeManifest(root, updated);
    await writeLock(root, lock);
  }

  if (multi) {
    line();
    const installed = requests.length - failures;
    line(
      `${failures > 0 ? symbol.fail : symbol.ok} ${installed} ${installed === 1 ? 'skill' : 'skills'} installed, ${failures} failed`,
    );
  }

  return failures > 0 ? 1 : 0;
}
