/**
 * Filter engine: field-path resolution + operator semantics.
 *
 * Filters are expressed as `{ field, operator, value }` where `field` is a
 * dotted path into the Kubernetes object, e.g.:
 *
 *   - `metadata.namespace`
 *   - `spec.state`
 *   - `status.conditions[*].type`   (any array element matches)
 *   - `status.conditions[0].type`   (specific index)
 *
 * All active filters are ANDed.
 */

export const filterOperators = ["=", "!=", "contains", "!contains", "regex", "exists", "!exists"] as const;

export type FilterOperator = (typeof filterOperators)[number];

export interface FieldFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

/** Get the values at `path` inside `item`. Arrays fan out over `[*]` or `[i]`. */
export function getFieldValues(item: object, path: string): unknown[] {
  const segments = parsePath(path);
  let current: unknown[] = [item];

  for (const segment of segments) {
    const next: unknown[] = [];

    for (const node of current) {
      if (node == null || typeof node !== "object") {
        continue;
      }

      if (segment.kind === "any-index") {
        if (Array.isArray(node)) {
          next.push(...node);
        }
        continue;
      }

      if (Array.isArray(node)) {
        if (segment.kind === "index" && segment.index < node.length) {
          next.push(node[segment.index]);
        }
        continue;
      }

      next.push((node as Record<string, unknown>)[(segment as { name: string }).name]);
    }

    current = next;
  }

  return current;
}

type PathSegment = { kind: "name"; name: string } | { kind: "index"; index: number } | { kind: "any-index" };

function parsePath(path: string): PathSegment[] {
  return path
    .split(".")
    .filter((part) => part.length > 0)
    .flatMap((part) => {
      const segments: PathSegment[] = [];
      // split `name[0]`, `name[*]`, `name` — also tolerate `name[]`
      const base = part.replace(/\[.*?\]/g, (bracket) => {
        const inner = bracket.slice(1, -1).trim();
        if (inner === "*" || inner === "") {
          segments.push({ kind: "any-index" });
        } else if (/^\d+$/.test(inner)) {
          segments.push({ kind: "index", index: Number(inner) });
        }
        return "";
      });

      if (base.length > 0) {
        segments.unshift({ kind: "name", name: base });
      }
      return segments;
    });
}

/** Normalize a value for comparison; returns undefined when it doesn't exist. */
function normalize(value: unknown): string | number | boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function valuesMatch(operator: FilterOperator, filterValue: string, actual: string | number | boolean | null): boolean {
  const actualStr = String(actual);

  switch (operator) {
    case "=": {
      if (typeof actual === "number" && filterValue.trim() !== "" && !Number.isNaN(Number(filterValue))) {
        return actual === Number(filterValue);
      }
      if (typeof actual === "boolean") {
        return String(actual) === filterValue.trim().toLowerCase();
      }
      return actualStr.toLowerCase() === filterValue.toLowerCase();
    }
    case "!=":
      return !valuesMatch("=", filterValue, actual);
    case "contains":
      return actualStr.toLowerCase().includes(filterValue.toLowerCase());
    case "!contains":
      return !actualStr.toLowerCase().includes(filterValue.toLowerCase());
    case "regex":
      try {
        return new RegExp(filterValue).test(actualStr);
      } catch {
        // invalid regex never matches, so the UI can keep typing
        return false;
      }
    default:
      return false;
  }
}

/** Does a single filter match one item? */
export function matchesFilter(item: object, filter: FieldFilter): boolean {
  const values = getFieldValues(item, filter.field);
  const normalized = values.map(normalize);
  const exists = normalized.some((v) => v !== undefined && v !== null && v !== "");

  switch (filter.operator) {
    case "exists":
      return exists;
    case "!exists":
      return !exists;
    default:
      break;
  }

  if (filter.value === "") {
    // empty value disables the filter (treated as "match everything")
    return true;
  }

  return normalized.some((v) => v !== undefined && v !== null && valuesMatch(filter.operator, filter.value, v));
}

/** AND all filters. Empty value filters are pass-through. */
export function matchesAllFilters(item: object, filters: FieldFilter[]): boolean {
  return filters.every((filter) => matchesFilter(item, filter));
}
