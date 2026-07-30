// src/context/verify.mjs
// Re-read what the model claimed to have read.
//
// Instructions not to hallucinate are the weakest control available. This is
// the strong one: a value survives only when the file it cites still contains
// it. What this cannot catch is a plausible but wrong summary, and nothing
// mechanical can, which is why the output is always shown as a diff.

/**
 * Read an answers file in either form the project offers.
 *
 * Two: `NAME: value` with indented `evidence:` lines under it, and the JSON
 * object `verifyAnswers` consumes. Both exist because the brief this feature
 * prints documented the text form while the command only ever ran JSON.parse, so
 * following the printed instructions produced "not valid JSON". The half of a
 * feature a person reads has to be the half that works.
 *
 * The text form is also the easier one for a model to emit: no escaping, no
 * trailing comma to get wrong, and a citation per line.
 *
 * @param {string} raw contents of the answers file
 * @returns {Record<string, {value: string, evidence: string[]}>}
 */
export function parseAnswers(raw) {
  const text = raw.trim();
  if (text.startsWith('{')) return JSON.parse(text);

  const answers = {};
  let current = null;

  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // An evidence line belongs to the answer above it. With no answer above it
    // the file is malformed, and saying so beats falling through to the NAME
    // branch, which used to invent a placeholder called "evidence" that then
    // failed verification for a reason pointing nowhere near the real mistake.
    const evidence = /^\s*evidence:\s*(.+)$/.exec(line);
    if (evidence) {
      if (!current) {
        throw new Error(
          `"${line.trim()}" belongs under an answer, so put a NAME: value line above it`,
        );
      }
      answers[current].evidence.push(evidence[1].trim());
      continue;
    }

    // NAME: value. Split on the first colon only, so a value may contain more.
    const at = line.indexOf(':');
    if (at === -1) {
      throw new Error(
        `cannot read "${line.trim()}": an answer is written as NAME: value, with an indented "evidence: path:line" under it`,
      );
    }
    current = line.slice(0, at).trim();
    answers[current] = { value: line.slice(at + 1).trim(), evidence: [] };
  }

  if (Object.keys(answers).length === 0) {
    throw new Error('no answers found: write each one as NAME: value with an indented evidence line');
  }
  return answers;
}

/** `path`, `path:12`, or `path:12-40`. */
function parseCitation(citation) {
  const match = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(citation.trim());
  if (!match) return { path: citation, from: null, to: null };
  const [, path, from, to] = match;
  return { path, from: from ? Number(from) : null, to: to ? Number(to) : null };
}

const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {Record<string, {value: string, evidence: string[]}>} answers
 * @param {(path: string) => Promise<string|null>} read
 */
export async function verifyAnswers(answers, read) {
  const accepted = {};
  const downgraded = [];

  for (const [name, answer] of Object.entries(answers)) {
    const evidence = answer.evidence ?? [];
    if (evidence.length === 0) {
      accepted[name] = 'Unknown';
      downgraded.push({ name, reason: 'no citation was given' });
      continue;
    }

    let resolved = false;
    const misses = [];
    for (const citation of evidence) {
      const { path, from, to } = parseCitation(citation);
      const contents = await read(path);
      if (contents === null) {
        misses.push(`${path} does not exist`);
        continue;
      }
      const lines = contents.split('\n');
      const slice = from === null ? contents : lines.slice(from - 1, (to ?? from)).join('\n');
      if (normalize(slice).includes(normalize(answer.value))) {
        resolved = true;
        break;
      }
      misses.push(`not found in ${citation}`);
    }

    if (resolved) accepted[name] = answer.value;
    else {
      accepted[name] = 'Unknown';
      downgraded.push({ name, reason: misses.join(', ') });
    }
  }

  return { accepted, downgraded };
}
