// Every value the repository already states, written without asking a model.
//
// This is the strongest anti-hallucination control available: a field that is
// never offered to a model cannot be invented by one. Roughly sixty percent of
// the placeholders are facts sitting in manifests and lockfiles.

/** `npm test` rather than `npm run test`, which is what people actually type. */
function commandFor(name, script) {
  const bare = ['test', 'start'];
  return { command: bare.includes(name) ? `npm ${name}` : `npm run ${name}`, script };
}

function commandsTable(scripts) {
  const rows = Object.entries(scripts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, script]) => {
      const { command, script: value } = commandFor(name, script);
      return `| \`${command}\` | \`${value}\` |`;
    });
  return ['| Command | Runs |', '|---|---|', ...rows].join('\n');
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
    out.COMMANDS_TABLE = commandsTable(signals.commands.detail);
  }

  if (signals.frameworks.present && signals.frameworks.detail) {
    const rows = Object.entries(signals.frameworks.detail)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, version]) => `| \`${name}\` | ${version} |`);
    out.STACK_TABLE = ['| Package | Version |', '|---|---|', ...rows].join('\n');
  }

  if (signals.workflowSkills.present && signals.workflowSkills.detail) {
    out.WORKFLOW_SKILLS = signals.workflowSkills.detail.map((name) => `- \`/${name}\``).join('\n');
  }

  if (signals.librarySkills.present && signals.librarySkills.detail) {
    out.LIBRARY_SKILLS = signals.librarySkills.detail.map((name) => `- \`${name}\``).join('\n');
  }

  if (signals.database.present) {
    const migrations = signals.database.evidence.find((path) => path.includes('migrations'));
    if (migrations) out.MIGRATIONS_PATH = migrations.split('/').slice(0, -1).join('/');
  }

  return out;
}
