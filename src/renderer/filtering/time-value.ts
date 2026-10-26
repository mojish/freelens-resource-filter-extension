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
  const ms = amount * (multipliers[unit] ?? 0);
  // Stay within Date's supported range and exact integer milliseconds.
  return Number.isSafeInteger(ms) && ms <= 8_640_000_000_000_000 ? ms : null;
}

/** Kubernetes/RFC3339 timestamps, including fractional seconds and numeric offsets. */
export const RFC3339_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$";
const timestampPattern = new RegExp(RFC3339_PATTERN);

export function parseTimestampMs(value: string): number | null {
  if (!timestampPattern.test(value)) return null;
  // Date.parse normalizes impossible dates such as February 31. Reject those.
  const calendar = new Date(`${value.slice(0, 19)}Z`);
  if (Number.isNaN(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
