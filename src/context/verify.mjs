// src/context/verify.mjs
// Re-read what the model claimed to have read.
//
// Instructions not to hallucinate are the weakest control available. This is
// the strong one: a value survives only when the file it cites still contains
// it. What this cannot catch is a plausible but wrong summary, and nothing
// mechanical can, which is why the output is always shown as a diff.

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
