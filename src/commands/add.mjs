import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveSource } from '../fetch.mjs';
import { readIfPresent } from '../fs-util.mjs';
import { discoverSkills, installOne } from '../install.mjs';
import { readLock, writeLock } from '../lock.mjs';
import { MANIFEST_FILE, readManifest, setSkill, writeManifest } from '../manifest.mjs';
import { resolveRoots } from '../scope.mjs';
import { parseSkill } from '../skill.mjs';
import { githubShorthand, parseSource } from '../source.mjs';
import { TARGETS } from '../targets/index.mjs';
import { bold, dim, line, reportViolations, symbol } from '../ui.mjs';
import { frameBar, frameClose, frameLine, frameOpen, frameStep } from '../ui/frame.mjs';
import { pickSkills } from '../ui/picker.mjs';
import { initialState, selectedSummary } from '../ui/picker-state.mjs';
import { pickOne } from '../ui/select.mjs';
import { createManifest } from './init.mjs';

const GENERIC_TARGET_ID = 'generic';

// The open .agents/skills layout every Agent Skills client can read without
// its own adapter - what step 2 of the wizard calls "Universal". Kept as
// prose here, not derived from the targets list, because it names clients
// this package has no adapter for at all (Cline, Gemini CLI, Copilot, Zed,
// and Warp all read the open layout directly and need nothing from this
// project to do it).
const UNIVERSAL_READERS = ['Codex', 'Cline', 'Gemini CLI', 'Copilot', 'Zed', 'Warp'];
const UNIVERSAL_PATH = '.agents/skills';

// Step 2 shows every target except the universal one, under a short label
// and the path it writes to - targets/index.mjs's own `label` strings are
// written for --help output and are too long for a picker row.
const AGENT_SHORT_LABEL = { 'claude-code': 'Claude Code', codex: 'Codex', cursor: 'Cursor' };
const AGENT_PATH = { 'claude-code': '.claude/skills', codex: '.agents/skills', cursor: '.cursor/rules' };

const SCOPE_ITEMS = [
  { id: 'project', label: 'Project', hint: 'Install in current directory, committed with your project' },
  { id: 'global', label: 'Global', hint: 'Install in your home directory, available in every project' },
];

function agentItems() {
  return TARGETS.filter((target) => target.id !== GENERIC_TARGET_ID).map((target) => ({
    name: target.id,
    label: AGENT_SHORT_LABEL[target.id] ?? target.label,
    hint: AGENT_PATH[target.id],
  }));
}

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

  // Keep the original spec (a git source, its ref, everything) rather than the
  // resolved directory. installOne re-resolves from spec + name, via the same
  // locateSkill lookup discoverSkills just used to find this skill, so nothing
  // is lost by not handing it the already-resolved path - and what would be
  // lost by handing it the resolved path is the source itself: committed to
  // skills.json, a resolved directory is a path inside the local cache, useless
  // to anyone else and to this same machine once the cache is cleared.
  return { requests: selected.map((skill) => ({ spec, name: skill.name })), found };
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
 * What `add` installs when it is given no source and the manifest has
 * nothing listed either: this tool's own repository, pinned to the version
 * currently running, read straight out of package.json rather than
 * hardcoded, so a release bump and this default never drift apart.
 *
 * Pure: package.json already parsed in, a spec string or null out, so the
 * edge cases (no repository field, a non-github remote) are testable without
 * touching disk.
 */
export function defaultSourceFromPackage(pkg) {
  const url = pkg?.repository?.url ?? (typeof pkg?.repository === 'string' ? pkg.repository : null);
  const shorthand = githubShorthand(url);
  if (!shorthand || !pkg?.version) return null;
  return `${shorthand}#v${pkg.version}`;
}

/** Read this package's own package.json and resolve the default source from it. */
export async function resolveDefaultSource() {
  const path = new URL('../../package.json', import.meta.url);
  let pkg;
  try {
    pkg = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
  return defaultSourceFromPackage(pkg);
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
  global = false,
  home,
}) {
  // Where things actually land. Project scope (the default) is the project
  // itself, exactly as every command has always behaved; --global moves both
  // the installed skills and the manifest/lock tracking them into the home
  // directory, resolved once here so everything below reads and writes
  // through installRoot/manifestRoot rather than the bare project `root`.
  // `home` is only ever supplied by tests - a real run always resolves it
  // from os.homedir() inside resolveRoots.
  let scope = global ? 'global' : 'project';
  let { installRoot, manifestRoot } = resolveRoots({ scope, projectRoot: root, home });

  let manifest = await readManifest(manifestRoot);
  if (!manifest) {
    // Requiring a separate command to create a file this one can create
    // itself is friction for no benefit: detect targets (or take --target)
    // exactly as init would, print the same line init prints, then keep
    // going into the install below. Detection always looks at the project
    // directory, never the home directory, even for a global install: a
    // stray .cursor folder in someone's home says nothing about what this
    // project uses.
    manifest = await createManifest({ root: manifestRoot, targets, detectRoot: root });
  }

  // A source is required to install anything. When the caller gave none and
  // the manifest has nothing listed either, either just created or genuinely
  // empty, default to this tool's own skills rather than reporting "nothing
  // to install" for a state that only exists because nothing has ever been
  // added yet. A manifest that already lists skills keeps today's behavior
  // untouched: bare `add` installs those, and never touches this default.
  if (!spec && Object.keys(manifest.skills).length === 0) {
    const defaultSpec = await resolveDefaultSource();
    if (!defaultSpec) {
      line(
        `${symbol.fail} no source given, ${MANIFEST_FILE} lists no skills, and this package's own repository could not be determined from package.json, so pass a source explicitly.`,
      );
      return 1;
    }
    line(`no source given, installing this tool's own skills from ${defaultSpec}`);
    spec = defaultSpec;
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

  // Three interactive steps, in order: which skills, which agent tools to
  // install to, and which scope to install into. Off a TTY, or with --all,
  // none of this runs and behavior is exactly what it always was: install
  // everything to the detected (or given) targets, in project scope.
  //
  // Whether stdin and stdout are actually a terminal is decided once by the
  // CLI entry point, the one place that legitimately reads ambient process
  // state, and handed down as `interactive`. add() never reads
  // process.stdin/process.stdout itself, and a caller that omits
  // `interactive` gets the safe, non-blocking default of false.
  const runWizard = interactive && !all;
  let wizardOpen = false;
  const openWizard = () => {
    if (wizardOpen) return;
    wizardOpen = true;
    line(frameOpen('agentic'));
    line(frameBar());
  };
  // Cancelling any step - escape, ctrl+c, or losing the input stream - installs
  // nothing and exits clean. A person browsing and changing their mind is not
  // an error.
  const cancelWizard = () => {
    line(frameClose());
    line(`${symbol.warn} cancelled: nothing installed`);
    return 0;
  };

  // Step 1: which skills. Only offered when the source actually has more
  // than one to choose from and the caller has not already narrowed it down
  // with --only or --name.
  if (runWizard && found && found.length > 1 && !only && !name) {
    openWizard();
    line(frameStep(`Source: ${spec}`));
    line(frameBar());
    line(frameStep('Repository cloned'));
    line(frameBar());
    line(frameStep(`Found ${found.length} ${found.length === 1 ? 'skill' : 'skills'}`));

    const items = await skillDescriptions(found);
    const chosen = await pickSkills(items);

    if (chosen === null || chosen.length === 0) return cancelWizard();

    line(frameStep('Select skills to install'));
    for (const chosenName of chosen) line(frameLine(chosenName));

    const chosenNames = new Set(chosen);
    requests = requests.filter((request) => chosenNames.has(request.name));
  }

  // Step 2: which agent tools to install to. Skipped when the caller already
  // said via -a/--target; targetList stays whatever it always was in that
  // case. The universal .agents/skills layout is never itself a choice here -
  // every Agent Skills client reads it - so only the other targets are
  // offered, preselected with whatever detection already chose.
  let targetList = targets.length > 0 ? targets : manifest.targets;
  if (runWizard && targets.length === 0) {
    openWizard();
    line(frameStep(`${TARGETS.length} agents`));

    const preselected = manifest.targets.filter((id) => id !== GENERIC_TARGET_ID);
    const chosenAgents = await pickSkills(agentItems(), {
      title: 'Which agents do you want to install to?',
      group: 'Additional agents',
      always: UNIVERSAL_READERS,
      alwaysLabel: `Universal (${UNIVERSAL_PATH}) — always included`,
      selected: preselected,
    });

    if (chosenAgents === null) return cancelWizard();

    line(frameStep('Which agents do you want to install to?'));
    line(frameLine(selectedSummary(initialState(agentItems(), { selected: chosenAgents }))));

    targetList = [...new Set([...chosenAgents, GENERIC_TARGET_ID])];
    manifest = { ...manifest, targets: targetList };
  }

  // Step 3: installation scope. Skipped by --global, which already forced
  // scope above; project is the default and is offered first.
  if (runWizard && !global) {
    openWizard();
    const chosenScope = await pickOne(SCOPE_ITEMS, { title: 'Installation scope' });

    if (chosenScope === null) return cancelWizard();

    line(frameStep('Installation scope'));
    line(frameLine(chosenScope === 'global' ? 'Global' : 'Project'));

    if (chosenScope !== scope) {
      scope = chosenScope;
      ({ installRoot, manifestRoot } = resolveRoots({ scope, projectRoot: root, home }));
    }
  }

  if (wizardOpen) line(frameClose());

  if (requests.length === 0) {
    line(`${symbol.warn} nothing to install: ${MANIFEST_FILE} lists no skills.`);
    return 0;
  }

  // A source that provides many skills gets a count up front and a tighter
  // per-skill line, so installing nine reads as one report instead of nine
  // repetitions of the same source string. The count is what is actually
  // about to be installed, which --only or the picker may have already
  // narrowed down from what the source provides; when the two differ, both
  // are said, or "Found 3 skills" would read as a lie above 2 install rows.
  const multi = Boolean(found && found.length > 0);
  if (multi) {
    const installing = requests.length;
    const noun = installing === 1 ? 'skill' : 'skills';
    const total = installing === found.length ? '' : ` (${found.length} available)`;
    line(`Found ${installing} ${noun} in ${spec}${total}`);
    line();
  }
  const nameWidth = multi ? Math.max(...requests.map((r) => (r.name ?? '').length)) : 0;

  const lock = await readLock(manifestRoot);
  let updated = manifest;
  let failures = 0;

  for (const request of requests) {
    const result = await installOne({
      root: installRoot,
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
          line(`    ${dim(file.path.replace(`${installRoot}/`, ''))}`);
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
    // manifestRoot may not exist yet - a fresh global install's ~/.agentic,
    // most commonly - even though createManifest above already handles the
    // case where the manifest itself was missing; this covers scope
    // switching to global mid-wizard, after that check already ran against
    // the old, project manifestRoot.
    await mkdir(manifestRoot, { recursive: true });
    await writeManifest(manifestRoot, updated);
    await writeLock(manifestRoot, lock);
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
