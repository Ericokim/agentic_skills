// How and when background work is scheduled to run.

export const id = 'scheduler';
export const number = 18;
export const title = 'Scheduler';
export const when = (signals) => signals.backgroundWork.present;
export const requires = 'background work';

export function text(signals) {
  return `# 18. Scheduler

{{SCHEDULE_TABLE}}

- Changing a schedule changes production behavior; treat it like a code
  change, not a config tweak.
- A job must be safe to run twice if the scheduler ever fires it twice.
- Check for a collision with an existing job before adding a new one.`;
}
