/**
 * Empty-state hints when filters match zero items.
 */

import type { FieldFilter } from "./filter-engine";

function pathSimilarity(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) {
    return 100;
  }
  if (al.includes(bl) || bl.includes(al)) {
    return 80;
  }
  const aParts = new Set(al.split(/[.[\]*]+/).filter(Boolean));
  const bParts = bl.split(/[.[\]*]+/).filter(Boolean);
  let shared = 0;
  for (const part of bParts) {
    if (aParts.has(part)) {
      shared += 1;
    }
  }
  return shared * 10 - Math.abs(a.length - b.length);
}

export interface EmptyMatchHintInput {
  filters: FieldFilter[];
  knownPaths: string[];
}

/** Short teaching hints for a zero-match result. */
export function emptyMatchHints({ filters, knownPaths }: EmptyMatchHintInput): string[] {
  const hints: string[] = [];
  const active = filters.filter(
    (filter) =>
      filter.field !== "" &&
      (filter.operator === "exists" || filter.operator === "!exists" || filter.value !== ""),
  );

  for (const filter of active) {
    if (knownPaths.includes(filter.field)) {
      continue;
    }
    const closest = [...knownPaths]
      .map((path) => ({ path, score: pathSimilarity(path, filter.field) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.path);
    if (closest.length > 0) {
      hints.push(`Closest fields to "${filter.field}": ${closest.join(", ")}`);
    }
  }

  if (active.length > 0) {
    hints.push("Try operator `exists`, clear a row, or loosen a value.");
  }

  return hints;
}
