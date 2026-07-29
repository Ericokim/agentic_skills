// Parses a source spec string into something the fetcher can act on.
//
// Pure: string in, descriptor out. Nothing here touches the network, so every
// spec form is testable without a repo to clone.
//
// Forms:
//   github:owner/repo[/subpath][#ref]
//   owner/repo[/subpath][#ref]              shorthand for github
//   git+<url>[#ref]                         any git remote
//   file:<path> | ./path | ../path | /path  a local directory

export class SourceParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceParseError';
  }
}

function descriptor(fields) {
  return {
    ref: null,
    subpath: null,
    path: null,
    url: null,
    ...fields,
    toString() {
      if (this.kind === 'file') return `file:${this.path}`;
      const subpath = this.subpath ? `/${this.subpath}` : '';
      const ref = this.ref ? `#${this.ref}` : '';
      // A github shorthand round trips as itself. Anything else is a git
      // remote by url, and needs the `git+` prefix put back so this string
      // parses back to kind 'git' rather than being mistaken for a local
      // path - `git+file://` is the case that would otherwise collide with
      // the `file:` scheme this same toString uses for local sources above.
      if (this.shorthand) return `${this.shorthand}${subpath}${ref}`;
      return `git+${this.url}${subpath}${ref}`;
    },
  };
}

/** Split a trailing `#ref` off a spec. */
function splitRef(spec) {
  const hash = spec.indexOf('#');
  if (hash === -1) return { rest: spec, ref: null };
  return { rest: spec.slice(0, hash), ref: spec.slice(hash + 1) || null };
}

function parseGithub(body, ref) {
  const segments = body.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new SourceParseError(
      `github source needs owner/repo, got "${body}" (example: github:eric/agentic_skills#v1.0.0)`,
    );
  }
  const [owner, repo, ...rest] = segments;
  return descriptor({
    kind: 'git',
    url: `https://github.com/${owner}/${repo}.git`,
    shorthand: `github:${owner}/${repo}`,
    subpath: rest.length > 0 ? rest.join('/') : null,
    ref,
  });
}

/**
 * Convert a git remote url into the `github:owner/repo` shorthand this file
 * already parses, for the one caller that starts from a bare url out of
 * package.json rather than a spec a person typed. Anything that is not a
 * github.com url returns null, so that caller can fail cleanly instead of
 * guessing at an owner and repo that are not there.
 */
export function githubShorthand(url) {
  if (typeof url !== 'string') return null;
  const stripped = url.replace(/^git\+/, '');
  const match = stripped.match(
    /^(?:https?:\/\/|git@)github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
  );
  if (!match) return null;
  const [, owner, repo] = match;
  return `github:${owner}/${repo}`;
}

/**
 * @param {string} spec
 * @returns {{kind: 'git'|'file', url: string|null, path: string|null, ref: string|null, subpath: string|null}}
 */
export function parseSource(spec) {
  if (typeof spec !== 'string' || spec.trim() === '') {
    throw new SourceParseError('empty source spec');
  }
  const trimmed = spec.trim();

  if (trimmed.startsWith('file:')) {
    return descriptor({ kind: 'file', path: trimmed.slice('file:'.length) });
  }
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/')) {
    return descriptor({ kind: 'file', path: trimmed });
  }

  const { rest, ref } = splitRef(trimmed);

  if (rest.startsWith('github:')) {
    return parseGithub(rest.slice('github:'.length), ref);
  }
  if (rest.startsWith('git+')) {
    return descriptor({ kind: 'git', url: rest.slice('git+'.length), ref });
  }
  if (/^(https?|ssh):\/\//.test(rest) || rest.startsWith('git@')) {
    return descriptor({ kind: 'git', url: rest, ref });
  }
  if (/^[\w.-]+\/[\w.-]+/.test(rest)) {
    return parseGithub(rest, ref);
  }

  throw new SourceParseError(
    `unrecognized source "${spec}", so use github:owner/repo, git+<url>, or a local path`,
  );
}
