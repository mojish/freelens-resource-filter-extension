/**
 * Value suggestions taken from a (possibly already filtered) item list.
 */

import { getFieldValues } from "./filter-engine";

const MAX = 100;

/** Distinct scalar values at `path` across `items`. */
export function valueSuggestionsFromItems(items: object[], path: string): string[] {
  if (path === "") {
    return [];
  }
  const seen = new Set<string>();
  for (const item of items) {
    for (const value of getFieldValues(item, path)) {
      if (value === undefined || value === null || typeof value === "object") {
        continue;
      }
      seen.add(String(value));
      if (seen.size >= MAX) {
        return [...seen].sort();
      }
    }
  }
  return [...seen].sort();
}
