// agentic tokens: where did the tokens go in a real session?
//
// `validate` reports what a skill costs in bytes before you install it. This
// reports what a run actually spent, which is the number that says whether a
// skill earned its size.
//
// It separates main thread cost from subagent cost, splits raw tokens into
// fresh input, cache write, and cache read, and prints an approximate billed
// equivalent, so a scary resident number (an 80k turn) can be recognised as
// mostly cheap cache reads.
//
// Reads Claude Code's own session files under
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl. Writes nothing.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { bold, dim, line, symbol } from '../ui.mjs';

// Cost weights RELATIVE to one uncached input token (= 1.0). The standard cache
// and output multipliers. They turn raw counts into one comparable unit, not a
// dollar price, which depends on the model tier. Output dominates, which is the
// part most people are surprised by.
const WEIGHT = { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 };

/**
 * Claude Code encodes a project directory into a flat name.
 *
 * Slashes become dashes, and so do underscores: this repo lives at
 * agentic_skills and its transcripts sit under `...-agentic-skills`. Handling
 * only the slash silently looks in a directory that never exists.
 */
const encodeProjectDir = (path) => path.replace(/[/_]/g, '-');

/** Transcripts for a project, newest first. */
function findTranscripts(project) {
  const dir = join(homedir(), '.claude', 'projects', project);
  if (!existsSync(dir)) return { dir, sessions: [] };
  const sessions = readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return { dir, sessions };
}

const empty = () => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, turns: 0 });

function accumulate(into, usage) {
  into.input += usage.input_tokens ?? 0;
  into.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  into.cacheRead += usage.cache_read_input_tokens ?? 0;
  into.output += usage.output_tokens ?? 0;
  into.turns += 1;
}

const costUnits = (a) =>
  a.input * WEIGHT.input +
  a.cacheWrite * WEIGHT.cacheWrite +
  a.cacheRead * WEIGHT.cacheRead +
  a.output * WEIGHT.output;

const rawTotal = (a) => a.input + a.cacheWrite + a.cacheRead + a.output;
const short = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const pad = (text, width) => String(text).padStart(width);

/** Parse one transcript into main, subagent, and per turn totals. */
export function readTranscript(contents) {
  const main = empty();
  const sub = empty();
  const turns = [];
  const seen = new Set(); // Claude Code logs some assistant events more than once

  for (const raw of contents.split('\n')) {
    if (!raw.trim()) continue;

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue; // a partially written last line is normal on a live session
    }

    const usage = event.message?.usage;
    if (!usage) continue;

    const id = event.message?.id ?? event.uuid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    const isSubagent = Boolean(event.isSidechain);
    accumulate(isSubagent ? sub : main, usage);
    turns.push({
      output: usage.output_tokens ?? 0,
      resident: (usage.cache_read_input_tokens ?? 0) + (usage.input_tokens ?? 0),
      isSubagent,
      at: event.timestamp ?? '',
    });
  }

  const all = empty();
  for (const source of [main, sub]) {
    for (const key of Object.keys(all)) all[key] += source[key];
  }

  return { main, sub, all, turns };
}

export async function tokens({ root, file, project, top }) {
  const limit = Number(top ?? 12);
  const encoded = project ?? encodeProjectDir(root);

  let path = file;
  if (!path) {
    const { dir, sessions } = findTranscripts(encoded);
    if (sessions.length === 0) {
      line(`${symbol.fail} no transcripts found for this project`);
      line(dim(`  looked in ${dir}`));
      line(dim('  pass a .jsonl path, or --project <encoded-dir-name>'));
      return 1;
    }
    path = sessions[0];
  }

  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    line(`${symbol.fail} cannot read ${path}: ${error.message}`);
    return 1;
  }

  const { main, sub, all, turns } = readTranscript(contents);
  if (all.turns === 0) {
    line(`${symbol.warn} no token usage recorded in ${path}`);
    return 0;
  }

  const row = (label, a) =>
    line(
      `  ${label.padEnd(10)}${pad(a.turns, 6)}${pad(short(a.input), 10)}${pad(short(a.cacheWrite), 12)}${pad(short(a.cacheRead), 11)}${pad(short(a.output), 9)}${pad(short(costUnits(a)), 11)}`,
    );

  line();
  line(dim(path));
  line();
  line(
    dim(
      `  ${'WHERE'.padEnd(10)}${pad('TURNS', 6)}${pad('INPUT', 10)}${pad('CACHE WRITE', 12)}${pad('CACHE READ', 11)}${pad('OUTPUT', 9)}${pad('BILLED EQ', 11)}`,
    ),
  );
  row('main', main);
  row('subagents', sub);
  row('total', all);

  const raw = rawTotal(all) || 1;
  const units = costUnits(all) || 1;
  line();
  line(`  ${bold(short(raw))} raw tokens, ${bold(short(units))} billed equivalent units.`);
  line(
    dim(
      `  ${Math.round((all.cacheRead / raw) * 100)}% of raw tokens were cache reads, billed at a tenth of fresh input.`,
    ),
  );
  line(
    dim(
      `  ${Math.round(((all.output * WEIGHT.output) / units) * 100)}% of the real cost was output, which is what to cut first.`,
    ),
  );
  line(
    dim(
      `  ${Math.round((costUnits(sub) / units) * 100)}% of the cost was subagents, context the main thread never paid for.`,
    ),
  );

  const heaviest = [...turns].sort((a, b) => b.output - a.output).slice(0, limit);
  if (heaviest.length > 0) {
    line();
    line(dim(`  HEAVIEST ${heaviest.length} TURNS BY OUTPUT`));
    for (const turn of heaviest) {
      line(
        `    ${pad(short(turn.output), 7)} out  ${pad(short(turn.resident), 8)} resident  ${(turn.isSubagent ? 'subagent' : 'main').padEnd(9)}${turn.at ? turn.at.slice(11, 19) : ''}`,
      );
    }
  }
  line();
  return 0;
}
