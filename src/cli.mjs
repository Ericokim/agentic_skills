#!/usr/bin/env node
// agentic: the standard the skills in this repo are held to, and the tools that
// check it.
//
// Installing is not here on purpose. The skills CLI already resolves a git
// source, prompts through the four step wizard, knows the paths of seventy five
// agent tools, and writes skills-lock.json. Reimplementing that was two
// thousand lines to be worse at it, and it cannot be imported either: the
// package publishes a bin and no main, so wrapping it would mean shelling out
// to a CLI a person can type themselves.
//
// What cannot be rented is the reason this repo exists. A copier delivers the
// standard only if what it copies already carries it, so `build` injects the
// rule blocks and `validate` refuses an incoherent declaration before anything
// is published. The check moved from install time to publish time; it did not
// disappear.
//
// Argument parsing is hand rolled and stays that way, for the same reason there
// are no dependencies at all.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build as buildCommand } from './commands/build.mjs';
import { context as contextCommand } from './commands/context.mjs';
import { profile as profileCommand } from './commands/profile.mjs';
import { tokens } from './commands/tokens.mjs';
import { validate as validateCommand } from './commands/validate.mjs';
import { STANDARD_VERSION } from './standard/index.mjs';
import { bold, dim, fail, line } from './ui.mjs';

const BOOLEAN_FLAGS = new Set(['help', 'version', 'check']);

/** Parse `command args --flags` without a dependency. */
export function parseArgv(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) {
      positional.push(token);
      continue;
    }
    const name = token.replace(/^--?/, '');
    const alias = { h: 'help', v: 'version' }[name] ?? name;

    if (BOOLEAN_FLAGS.has(alias)) {
      flags[alias] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`--${alias} needs a value`);
    }
    index += 1;
    flags[alias] = value;
  }

  return { command: positional[0] ?? null, args: positional.slice(1), flags };
}

export const USAGE = `${bold('agentic')} ${dim('· agent skills that meet a checkable standard')}

${bold('INSTALLING THESE SKILLS')}
  npx -y skills@latest add Ericokim/agentic_skills

  That is the whole install. The skills CLI does the resolving, the wizard,
  and the agent paths; every skill in this repo is committed with the
  standard's rule blocks already injected, so a copier delivers them intact.

${bold('USAGE')}
  agentic <command> [arguments] [options]

${bold('COMMANDS')}
  validate [path]           check skills against the standard
  build                     regenerate the standard blocks in skills/ in place,
                             refusing to write anything if one fails the standard
  build --check             report what a build would change without writing,
                             exiting non zero when skills/ is stale
  tokens [file.jsonl]       where the tokens went in a real session
  profile                   show what this project looks like, and the evidence
  context                   plan an AGENTS.md, writing a draft and a brief
  context --answers <file>  verify cited answers and write AGENTS.generated.md

${bold('OPTIONS')}
      --answers <file>      context: a JSON file of cited answers to verify
      --root <dir>          project root (default: the working directory)
      --top <n>             tokens: heaviest turns to show (default: 12)
      --project <dir>       tokens: encoded transcript directory to read
  -h, --help                show this
  -v, --version             show the versions
`;

async function version() {
  const path = new URL('../package.json', import.meta.url);
  const { version: packageVersion } = JSON.parse(await readFile(path, 'utf8'));
  line(`agentic ${packageVersion}`);
  line(dim(`standard ${STANDARD_VERSION}`));
  return 0;
}

/**
 * Commands this tool used to own and the skills CLI now does.
 *
 * Saying so beats "unknown command": someone typing `agentic add` read a
 * README, and the useful answer is the command that works, not a list of the
 * ones that remain.
 */
const RENTED = {
  add: 'npx -y skills@latest add Ericokim/agentic_skills',
  install: 'npx -y skills@latest add Ericokim/agentic_skills',
  init: 'npx -y skills@latest add Ericokim/agentic_skills',
  update: 'npx -y skills@latest add Ericokim/agentic_skills',
  remove: 'npx -y skills@latest remove <skill>',
  rm: 'npx -y skills@latest remove <skill>',
  list: 'npx -y skills@latest list',
  ls: 'npx -y skills@latest list',
};

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

  switch (command) {
    case 'validate':
      return validateCommand({ root, target: resolve(args[0] ?? 'skills') });
    case 'build':
      return buildCommand({ root, check: Boolean(flags.check) });
    case 'tokens':
      return tokens({
        root,
        file: args[0] ?? null,
        project: flags.project ?? null,
        top: flags.top ?? null,
      });
    case 'profile':
      return profileCommand({ root });
    case 'context':
      return contextCommand({
        root,
        plan: true,
        answers: flags.answers ? resolve(flags.answers) : null,
      });
    default:
      if (RENTED[command]) {
        fail(`installing is not this tool's job, so run instead:`);
        line(`  ${bold(RENTED[command])}`);
        line(dim('  the skills CLI owns installing, and the record of what it installed'));
        return 2;
      }
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
