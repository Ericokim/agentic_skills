#!/usr/bin/env node
// agentic: install versioned Agent Skills that meet a checkable standard.
//
// Argument parsing is hand rolled and stays that way. A package manager whose
// job is to install with no dependency tree should not have one of its own.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { add } from './commands/add.mjs';
import { doctor } from './commands/doctor.mjs';
import { init } from './commands/init.mjs';
import { list } from './commands/list.mjs';
import { remove } from './commands/remove.mjs';
import { update } from './commands/update.mjs';
import { validate as validateCommand } from './commands/validate.mjs';
import { DEFAULT_CACHE_DIR } from './fetch.mjs';
import { STANDARD_VERSION } from './standard/index.mjs';
import { TARGETS } from './targets/index.mjs';
import { bold, dim, fail, line } from './ui.mjs';

// Piping into head or less closes stdout early. That is normal use, not a
// crash, so exit quietly instead of throwing an unhandled EPIPE.
process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

const BOOLEAN_FLAGS = new Set(['dry-run', 'force', 'help', 'version']);

/** Parse `command args --flags` without a dependency. */
export function parseArgv(argv) {
  const positional = [];
  const flags = { target: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) {
      positional.push(token);
      continue;
    }
    const name = token.replace(/^--?/, '');
    const alias = { t: 'target', h: 'help', v: 'version', n: 'name' }[name] ?? name;

    if (BOOLEAN_FLAGS.has(alias)) {
      flags[alias] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`--${alias} needs a value`);
    }
    index += 1;
    if (alias === 'target') flags.target.push(...value.split(',').map((t) => t.trim()));
    else flags[alias] = value;
  }

  return { command: positional[0] ?? null, args: positional.slice(1), flags };
}

const USAGE = `${bold('agentic')} ${dim('· agent skills that meet a checkable standard')}

${bold('USAGE')}
  agentic <command> [arguments] [options]

${bold('COMMANDS')}
  init                      create skills.json, detecting the agent tools in use
  add [source]              install a skill, or every skill in skills.json
  update [name]             re-resolve and recompile, showing what changed
  remove <name>             delete a skill and the files it owns
  list                      installed skills, sources, and drift
  validate [path]           check skill sources against the standard
  doctor                    report every mismatch between declared and installed

${bold('OPTIONS')}
  -t, --target <id>         override targets (repeatable, or comma separated)
  -n, --name <name>         name to install a source under
      --root <dir>          project root (default: the working directory)
      --cache <dir>         source cache (default: ~/.cache/agentic/sources)
      --dry-run             plan the work and write nothing
      --force               overwrite installed files that were edited by hand
  -h, --help                show this
  -v, --version             show the versions

${bold('SOURCES')}
  github:owner/repo#v1.0.0            a tag, branch, or commit
  github:owner/repo/skills/build      a skill inside a repo
  git+https://host/team/skills.git    any git remote
  ./local/skill                       a directory on this machine

${bold('TARGETS')}
  ${TARGETS.map((target) => `${target.id.padEnd(24)}${target.label}`).join('\n  ')}
`;

async function version() {
  const path = new URL('../package.json', import.meta.url);
  const { version: packageVersion } = JSON.parse(await readFile(path, 'utf8'));
  line(`agentic ${packageVersion}`);
  line(dim(`standard ${STANDARD_VERSION}`));
  return 0;
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (error) {
    fail(error.message);
    return 2;
  }

  const { command, args, flags } = parsed;

  if (flags.version) return version();
  if (flags.help || command === null || command === 'help') {
    line(USAGE);
    return command === null && !flags.help ? 1 : 0;
  }

  const root = resolve(flags.root ?? process.cwd());
  const cacheDir = flags.cache ? resolve(flags.cache) : DEFAULT_CACHE_DIR;
  const shared = {
    root,
    cacheDir,
    cwd: process.cwd(),
    targets: flags.target,
    dryRun: Boolean(flags['dry-run']),
    force: Boolean(flags.force),
  };

  for (const target of flags.target) {
    if (!TARGETS.some((known) => known.id === target)) {
      fail(`unknown target "${target}", so use one of ${TARGETS.map((t) => t.id).join(', ')}`);
      return 2;
    }
  }

  switch (command) {
    case 'init':
      return init(shared);
    case 'add':
      return add({ ...shared, spec: args[0] ?? null, name: flags.name ?? null });
    case 'update':
      return update({ ...shared, name: args[0] ?? null });
    case 'remove':
    case 'rm':
      if (!args[0]) {
        fail('remove needs a skill name');
        return 2;
      }
      return remove({ ...shared, name: args[0] });
    case 'list':
    case 'ls':
      return list(shared);
    case 'validate':
      return validateCommand({ root, target: resolve(args[0] ?? 'skills') });
    case 'doctor':
      return doctor(shared);
    default:
      fail(`unknown command "${command}"`);
      line(dim('run agentic --help for the list'));
      return 2;
  }
}

/**
 * Is this file the process entry point?
 *
 * Compares real paths rather than names. Under npx the command is a symlink in
 * node_modules/.bin named after the bin, not after this file, so a name
 * comparison would decide we are not the entry point and exit doing nothing.
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      fail(error.message);
      process.exitCode = 1;
    });
}
