// Snapshot to signals. Pure, so every detection rule is testable with a literal.
//
// Every signal carries the files that produced it. A profile that cannot say
// why it believes something is a profile nobody can check, and this one is
// shown to a person before anything is generated.

/**
 * Dependency names that imply each signal.
 *
 * These come from every ecosystem this profiler recognises, not just npm.
 * A name only ever needs to appear once per category; `dependencyNames`
 * (exact match against a parsed package.json) and `manifestNameScan` (token
 * scan against the raw text of every other manifest format) both read from
 * this same list.
 */
const DEPENDENCY_HINTS = {
  database: [
    'pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongodb', 'mongoose', 'prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'knex', '@supabase/supabase-js',
    'psycopg2', 'psycopg', 'asyncpg', 'sqlalchemy', 'alembic', 'django', 'peewee', 'pymongo', 'redis-py',
    'sqlx', 'diesel', 'sea-orm', 'rusqlite',
    'gorm', 'pgx', 'database/sql',
    'activerecord', 'doctrine',
  ],
  httpRoutes: [
    'express', 'fastify', 'koa', 'hapi', '@nestjs/core', 'hono',
    'fastapi', 'flask', 'django', 'starlette', 'aiohttp', 'tornado',
    'axum', 'actix-web', 'rocket', 'warp',
    'gin-gonic', 'echo', 'fiber', 'chi',
    'sinatra', 'rails', 'laravel', 'symfony', 'spring-boot',
  ],
  backgroundWork: [
    'node-cron', 'bullmq', 'bull', 'agenda', 'celery', 'sidekiq', 'temporal', 'inngest', 'graphile-worker',
    'rq', 'apscheduler', 'dramatiq', 'huey',
    'tokio-cron-scheduler',
    'resque', 'delayed_job',
    'machinery',
  ],
  ui: [
    'react', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact',
    'streamlit', 'gradio', 'dash',
    'yew', 'leptos', 'dioxus',
  ],
  browserTooling: [
    '@playwright/test', 'playwright', 'cypress', 'puppeteer', 'selenium-webdriver',
    'selenium', 'splinter', 'capybara',
  ],
  tests: [
    'vitest', 'jest', 'mocha', 'ava', 'tap', '@playwright/test',
    'pytest', 'unittest2', 'nose2', 'tox',
    'cargo-nextest',
    'testify', 'ginkgo',
    'rspec', 'minitest',
    'phpunit',
  ],
};

/**
 * Manifest filenames (matched by basename, so a monorepo workspace still
 * counts) scanned with `manifestNameScan` rather than parsed.
 */
const TEXT_MANIFESTS = ['requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json'];

/** Recognised framework names. */
const FRAMEWORK_NAMES = [
  'next', 'react', 'vue', 'svelte', '@sveltejs/kit', 'nuxt', '@angular/core',
  'solid-js', 'preact', 'astro', 'remix', '@remix-run/react',
  'express', 'fastify', 'koa', 'hapi', '@nestjs/core', 'hono',
];

/** Path patterns that imply each signal. */
const PATH_HINTS = {
  database: [/^(migrations|db\/migrations|prisma|supabase\/migrations)\//],
  httpRoutes: [/^(app|src|pages)\/api\//, /^(routes|src\/routes)\//],
  backgroundWork: [/^(workers|jobs|src\/workers|src\/jobs)\//],
  ui: [/^(components|src\/components|app\/components)\//],
  tests: [/^(test|tests|__tests__|spec)\//, /\.(test|spec)\.[a-z]+$/],
  secrets: [/^\.env\.(example|sample)$/],
  domainLayer: [/^(src\/)?(domain|services|core|usecases|use-cases)\//],
};

const empty = () => ({ present: false, evidence: [] });

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every dependency name declared anywhere in a manifest. */
function dependencyNames(manifest) {
  return [
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
    ...Object.keys(manifest?.peerDependencies ?? {}),
  ];
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `name` appears as its own token anywhere in a manifest's raw text.
 *
 * This is a name scan, not a parser. requirements.txt, Cargo.toml, go.mod,
 * Gemfile, pyproject.toml, and composer.json each have their own syntax for
 * declaring a dependency (a version specifier, a TOML table, a require
 * directive, a DSL call), and this profiler does not implement any of them.
 * It does not need to: knowing that a known package name was declared
 * somewhere in the manifest is sufficient evidence for a signal, and the
 * name itself is usually the only fixed string across all of those syntaxes.
 * The word-boundary anchors keep this honest about what it is a scan of the
 * whole name as a token, so `pg` matches a bare `pg` line but not `pgcrypto`,
 * and `sqlx` does not match inside some longer, unrelated identifier.
 */
function manifestNameScan(text, name) {
  const pattern = new RegExp(`\\b${escapeForRegExp(name)}\\b`);
  return pattern.test(text);
}

/** File extensions that identify a language, keyed to the name reported in `languages.detail`. */
const LANGUAGE_EXTENSIONS = [
  { pattern: /\.(ts|tsx)$/, name: 'typescript' },
  { pattern: /\.(js|jsx|mjs)$/, name: 'javascript' },
  { pattern: /\.py$/, name: 'python' },
  { pattern: /\.rs$/, name: 'rust' },
  { pattern: /\.go$/, name: 'go' },
  { pattern: /\.rb$/, name: 'ruby' },
  { pattern: /\.php$/, name: 'php' },
  { pattern: /\.java$/, name: 'java' },
];

function mark(signal, evidence) {
  signal.present = true;
  if (!signal.evidence.includes(evidence)) signal.evidence.push(evidence);
}

/**
 * @param {{root: string, paths: string[], files: Record<string,string>}} snapshot
 * @returns {{signals: Record<string, {present: boolean, evidence: string[], detail?: any}>}}
 */
export function profile(snapshot) {
  const signals = {
    packageManager: empty(), languages: empty(), frameworks: empty(),
    database: empty(), httpRoutes: empty(), backgroundWork: empty(),
    ui: empty(), browserTooling: empty(), secrets: empty(), tests: empty(),
    commands: empty(), workflowSkills: empty(), librarySkills: empty(),
    domainLayer: empty(),
  };

  // Manifests, at any depth, so a monorepo workspace counts.
  for (const [path, contents] of Object.entries(snapshot.files)) {
    if (!path.endsWith('package.json')) continue;
    const manifest = parseJson(contents);
    if (!manifest) continue;

    const deps = dependencyNames(manifest);
    for (const [id, names] of Object.entries(DEPENDENCY_HINTS)) {
      if (deps.some((dep) => names.includes(dep))) mark(signals[id], path);
    }
    const allDeps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
    const recognizedFrameworks = Object.fromEntries(
      Object.entries(allDeps).filter(([name]) => FRAMEWORK_NAMES.includes(name))
    );
    if (Object.keys(recognizedFrameworks).length > 0) {
      mark(signals.frameworks, path);
      signals.frameworks.detail = { ...(signals.frameworks.detail ?? {}), ...recognizedFrameworks };
    }
    if (manifest.scripts && Object.keys(manifest.scripts).length > 0) {
      mark(signals.commands, path);
      signals.commands.detail = { ...(signals.commands.detail ?? {}), ...manifest.scripts };
    }
  }

  // Other ecosystems' manifests, at any depth. Scanned as text, not parsed;
  // see manifestNameScan for why that is enough.
  for (const [path, contents] of Object.entries(snapshot.files)) {
    if (!TEXT_MANIFESTS.includes(path.split('/').pop())) continue;
    for (const [id, names] of Object.entries(DEPENDENCY_HINTS)) {
      if (names.some((name) => manifestNameScan(contents, name))) mark(signals[id], path);
    }
  }

  // Lockfiles name the package manager.
  const LOCKS = {
    'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'yarn.lock': 'yarn', 'bun.lock': 'bun',
    'requirements.txt': 'pip', 'pyproject.toml': 'poetry',
    'Cargo.lock': 'cargo', 'go.sum': 'go modules', 'Gemfile.lock': 'bundler', 'composer.lock': 'composer',
  };
  for (const [file, name] of Object.entries(LOCKS)) {
    if (snapshot.files[file] !== undefined || snapshot.paths.includes(file)) {
      mark(signals.packageManager, file);
      signals.packageManager.detail = name;
    }
  }

  // Paths.
  for (const path of snapshot.paths) {
    for (const [id, patterns] of Object.entries(PATH_HINTS)) {
      if (patterns.some((pattern) => pattern.test(path))) mark(signals[id], path);
    }
    if (path.startsWith('.claude/skills/') || path.startsWith('.agents/skills/')) {
      const name = path.split('/')[2];
      if (name) {
        mark(signals.librarySkills, path);
        const seen = new Set(signals.librarySkills.detail ?? []);
        seen.add(name);
        signals.librarySkills.detail = [...seen].sort();
      }
    }
    for (const { pattern, name } of LANGUAGE_EXTENSIONS) {
      if (!pattern.test(path)) continue;
      mark(signals.languages, path);
      const seen = new Set(signals.languages.detail ?? []);
      seen.add(name);
      signals.languages.detail = [...seen].sort();
    }
  }

  // Environment samples name secrets.
  const envSample = snapshot.files['.env.example'] ?? snapshot.files['.env.sample'];
  if (envSample) {
    mark(signals.secrets, snapshot.files['.env.example'] ? '.env.example' : '.env.sample');
    signals.secrets.detail = envSample
      .split('\n')
      .map((line) => line.split('=')[0].trim())
      .filter((key) => key && !key.startsWith('#'));
    if (signals.secrets.detail.some((key) => /DATABASE|POSTGRES|MYSQL|MONGO/i.test(key))) {
      mark(signals.database, '.env.example');
    }
  }

  // Our own lockfile names the workflow skills exactly.
  const lock = parseJson(snapshot.files['skills.lock'] ?? '');
  if (lock && Object.keys(lock).length > 0) {
    mark(signals.workflowSkills, 'skills.lock');
    signals.workflowSkills.detail = Object.keys(lock).sort();
  }

  // CI workflows are a second source for commands.
  for (const path of Object.keys(snapshot.files)) {
    if (path.startsWith('.github/workflows/')) mark(signals.commands, path);
  }

  return { signals };
}
