/**
 * Parse relative durations used by older_than / newer_than operators.
 * Supports Ns, Nm, Nh, Nd (seconds, minutes, hours, days).
 */

const DURATION_RE = /^(\d+)\s*(s|m|h|d)$/i;

/** Returns duration in milliseconds, or null if the value is not a valid duration. */
export function parseRelativeDurationMs(value: string): number | null {
  const match = value.trim().match(DURATION_RE);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 0);
}
