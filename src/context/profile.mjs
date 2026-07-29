// Snapshot to signals. Pure, so every detection rule is testable with a literal.
//
// Every signal carries the files that produced it. A profile that cannot say
// why it believes something is a profile nobody can check, and this one is
// shown to a person before anything is generated.

/** Dependency names that imply each signal. */
const DEPENDENCY_HINTS = {
  database: ['pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongodb', 'mongoose', 'prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'knex', '@supabase/supabase-js'],
  httpRoutes: ['express', 'fastify', 'koa', 'hapi', '@nestjs/core', 'hono'],
  backgroundWork: ['node-cron', 'bullmq', 'bull', 'agenda', 'celery', 'sidekiq', 'temporal', 'inngest', 'graphile-worker'],
  ui: ['react', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact'],
  browserTooling: ['@playwright/test', 'playwright', 'cypress', 'puppeteer', 'selenium-webdriver'],
  tests: ['vitest', 'jest', 'mocha', 'ava', 'tap', '@playwright/test'],
};

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

  // Lockfiles name the package manager.
  const LOCKS = { 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'yarn.lock': 'yarn', 'bun.lock': 'bun' };
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
    if (/\.(ts|tsx)$/.test(path)) { mark(signals.languages, path); signals.languages.detail = 'typescript'; }
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
