// Every value the repository already states, written without asking a model.
//
// This is the strongest anti-hallucination control available: a field that is
// never offered to a model cannot be invented by one. Roughly sixty percent of
// the placeholders are facts sitting in manifests and lockfiles.

/** Package managers this profiler knows how to phrase a run command for. */
const KNOWN_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/** The detected package manager, or npm when it is unknown or undetected. */
function runnerFor(packageManager) {
  return KNOWN_RUNNERS.has(packageManager) ? packageManager : 'npm';
}

/** `npm test` rather than `npm run test`, which is what people actually type. */
function commandFor(name, script, runner) {
  const bare = ['test', 'start'];
  return { command: bare.includes(name) ? `${runner} ${name}` : `${runner} run ${name}`, script };
}

function commandsTable(scripts, runner) {
  const rows = Object.entries(scripts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, script]) => {
      const { command, script: value } = commandFor(name, script, runner);
      return `| \`${command}\` | \`${value}\` |`;
    });
  return ['| Command | Runs |', '|---|---|', ...rows].join('\n');
}

/** One combined summary of the workflow and library skills installed, or nothing when neither is. */
function skillsSummary(signals) {
  const parts = [];
  if (signals.workflowSkills.present && signals.workflowSkills.detail?.length) {
    const names = signals.workflowSkills.detail.map((name) => `\`/${name}\``).join(', ');
    parts.push(`Workflow skills installed: ${names}.`);
  }
  if (signals.librarySkills.present && signals.librarySkills.detail?.length) {
    const names = signals.librarySkills.detail.map((name) => `\`${name}\``).join(', ');
    parts.push(`Library skills installed: ${names}.`);
  }
  return parts.join(' ');
}

/**
 * @param {{signals: Record<string, {present: boolean, evidence: string[], detail?: any}>}} profileResult
 * @returns {Record<string, string>}
 */
export function prefill({ signals }) {
  const out = {};

  if (signals.packageManager.present && signals.packageManager.detail) {
    out.PACKAGE_MANAGER = signals.packageManager.detail;
  }

  if (signals.commands.present && signals.commands.detail) {
    out.COMMANDS_TABLE = commandsTable(signals.commands.detail, runnerFor(signals.packageManager.detail));
  }

  if (signals.frameworks.present && signals.frameworks.detail) {
    const rows = Object.entries(signals.frameworks.detail)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, version]) => `| \`${name}\` | ${version} |`);
    out.STACK_TABLE = ['| Package | Version |', '|---|---|', ...rows].join('\n');
  }

  if (signals.workflowSkills.present && signals.workflowSkills.detail) {
    out.INSTALLED_SKILLS = signals.workflowSkills.detail.map((name) => `- \`/${name}\``).join('\n');
  }

  const summary = skillsSummary(signals);
  if (summary) out.SKILLS_SUMMARY = summary;

  if (signals.database.present) {
    const migrations = signals.database.evidence.find((path) => path.includes('migrations'));
    if (migrations) out.MIGRATIONS_PATH = migrations.split('/').slice(0, -1).join('/');
  }

  return out;
}
