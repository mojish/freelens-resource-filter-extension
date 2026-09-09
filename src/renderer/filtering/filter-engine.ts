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
 * All active filters are ANDed. Rows with an empty field or an empty value
 * (for value operators) are disabled and match everything.
 */

export const filterOperators = ["=", "!=", "contains", "!contains", "regex", "in", "exists", "!exists"] as const;

export type FilterOperator = (typeof filterOperators)[number];

export interface FieldFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

/** Values longer than this are truncated before regex matching to bound the cost. */
const MAX_REGEX_TEST_LENGTH = 10_000;

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

/** Parse a comma-separated `in` value list into a lowercase set. */
function parseInList(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0),
  );
}

interface CompiledFilter {
  filter: FieldFilter;
  /** Precompiled regex for the `regex` operator; null when unused or invalid. */
  regex: RegExp | null;
  /** Precompiled lowercase set for the `in` operator. */
  inList: Set<string> | null;
}

/** Compile once per filter — never per item. Invalid regexes compile to null and never match. */
function compileFilter(filter: FieldFilter): CompiledFilter {
  return {
    filter,
    regex: filter.operator === "regex" ? tryCompileRegex(filter.value) : null,
    inList: filter.operator === "in" ? parseInList(filter.value) : null,
  };
}

function tryCompileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function valuesMatch(compiled: CompiledFilter, actual: string | number | boolean | null): boolean {
  const { filter } = compiled;
  const actualStr = String(actual);

  switch (filter.operator) {
    case "=": {
      if (typeof actual === "number" && filter.value.trim() !== "" && !Number.isNaN(Number(filter.value))) {
        return actual === Number(filter.value);
      }
      if (typeof actual === "boolean") {
        return String(actual) === filter.value.trim().toLowerCase();
      }
      return actualStr.toLowerCase() === filter.value.toLowerCase();
    }
    case "!=":
      return !valuesMatch({ ...compiled, filter: { ...filter, operator: "=" } }, actual);
    case "contains":
      return actualStr.toLowerCase().includes(filter.value.toLowerCase());
    case "!contains":
      return !actualStr.toLowerCase().includes(filter.value.toLowerCase());
    case "regex":
      return compiled.regex !== null && compiled.regex.test(actualStr.slice(0, MAX_REGEX_TEST_LENGTH));
    case "in":
      return compiled.inList !== null && compiled.inList.size > 0 && compiled.inList.has(actualStr.toLowerCase());
    default:
      return false;
  }
}

function matchesCompiled(item: object, compiled: CompiledFilter): boolean {
  const { filter } = compiled;

  if (filter.field === "") {
    // a row without a field is disabled
    return true;
  }

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

  if (filter.value === "" || (filter.operator === "in" && (compiled.inList?.size ?? 0) === 0)) {
    // empty value disables the filter (treated as "match everything")
    return true;
  }

  return normalized.some((v) => v !== undefined && v !== null && valuesMatch(compiled, v));
}

/** Does a single filter match one item? Convenience wrapper — compiles per call. */
export function matchesFilter(item: object, filter: FieldFilter): boolean {
  return matchesCompiled(item, compileFilter(filter));
}

/** AND all filters. Empty value filters are pass-through. */
export function matchesAllFilters(item: object, filters: FieldFilter[]): boolean {
  const compiled = filters.map(compileFilter);
  return compiled.every((c) => matchesCompiled(item, c));
}

/**
 * Build a matcher that compiles each filter once (regex, in-lists) and matches
 * many items against the same set. Use this on hot paths like list filtering.
 */
export function createFilterMatcher(filters: FieldFilter[]): (item: object) => boolean {
  const compiled = filters.map(compileFilter);
  return (item: object) => compiled.every((c) => matchesCompiled(item, c));
}
