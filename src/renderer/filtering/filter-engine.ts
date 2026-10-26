/**
 * Filter engine: field-path resolution + operator semantics.
 *
 * Filters are `{ field, operator, value, combinator? }` where `field` is a
 * dotted path into the Kubernetes object.
 *
 * Combinators: consecutive `or` rows form a group; groups are ANDed.
 * Empty field / empty value (for value operators) disables a row.
 */

import { parseRelativeDurationMs, parseTimestampMs } from "./time-value";

export const filterOperators = [
  "=",
  "!=",
  "contains",
  "!contains",
  "regex",
  "in",
  "exists",
  "!exists",
  "older_than",
  "newer_than",
] as const;

export type FilterOperator = (typeof filterOperators)[number];

export type FilterCombinator = "and" | "or";

export interface FieldFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  /** How this row combines with the previous one. Ignored on the first active row. */
  combinator?: FilterCombinator;
}

/** Bound regex input size consistently across UI, yq and jq (Unicode code points). */
export const MAX_REGEX_TEST_LENGTH = 10_000;

/** Get the values at `path` inside `item`. Arrays fan out over `[*]` or `[i]`. */
export function getFieldValues(item: object, path: string): unknown[] {
  const segments = parsePath(path);
  if (path.trim() !== "" && segments.length === 0) return [];
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
        } else {
          next.push(...Object.values(node as Record<string, unknown>));
        }
        continue;
      }

      if (Array.isArray(node)) {
        if (segment.kind === "index" && segment.index < node.length) {
          next.push(node[segment.index]);
        }
        continue;
      }

      if (segment.kind === "name") {
        next.push(Object.prototype.hasOwnProperty.call(node, segment.name)
          ? (node as Record<string, unknown>)[segment.name] : undefined);
      }
    }

    current = next;
  }

  return current;
}

export type PathSegment = { kind: "name"; name: string } | { kind: "index"; index: number } | { kind: "any-index" };

/** Parse dotted names, JSON-quoted map keys, array indexes, and wildcards. Invalid paths fail closed. */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let rest = path.trim();
  while (rest.length > 0) {
    if (rest.startsWith("[")) {
      const bracket = rest.match(/^\[\s*("(?:\\.|[^"\\])*"|\d+|\*?)\s*\]/);
      if (!bracket) return [];
      const inner = bracket[1];
      if (inner.startsWith('"')) {
        try {
          segments.push({ kind: "name", name: JSON.parse(inner) as string });
        } catch {
          return [];
        }
      } else if (inner === "" || inner === "*") {
        segments.push({ kind: "any-index" });
      } else {
        const index = Number(inner);
        if (!Number.isSafeInteger(index)) return [];
        segments.push({ kind: "index", index });
      }
      rest = rest.slice(bracket[0].length);
    } else {
      const name = rest.match(/^[^.[\]\s"']+/);
      if (!name) return [];
      segments.push({ kind: "name", name: name[0] });
      rest = rest.slice(name[0].length);
    }
    if (rest.startsWith(".")) {
      rest = rest.slice(1);
      if (!rest) return [];
    } else if (rest && !rest.startsWith("[")) {
      return [];
    }
  }
  return segments;
}

/** Use bracket notation whenever a map key could be mistaken for path syntax. */
export function encodePathKey(key: string): string {
  return /^[A-Za-z_@][A-Za-z0-9_@-]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
}

export function joinPathParts(parts: string[]): string {
  return parts.reduce((path, part) => path + (path && !part.startsWith("[") ? "." : "") + part, "");
}

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
  regex: RegExp | null;
  inList: Set<string> | null;
  durationMs: number | null;
  now: number;
}

function compileFilter(filter: FieldFilter, now = Date.now()): CompiledFilter {
  return {
    filter,
    now,
    regex: filter.operator === "regex" ? tryCompileRegex(filter.value) : null,
    inList: filter.operator === "in" ? parseInList(filter.value) : null,
    durationMs:
      filter.operator === "older_than" || filter.operator === "newer_than"
        ? parseRelativeDurationMs(filter.value)
        : null,
  };
}

function tryCompileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function regexPrefix(value: string): string {
  let end = 0;
  let count = 0;
  for (const character of value) {
    if (count++ === MAX_REGEX_TEST_LENGTH) break;
    end += character.length;
  }
  return value.slice(0, end);
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
      return compiled.regex !== null && compiled.regex.test(regexPrefix(actualStr));
    case "in":
      return compiled.inList !== null && compiled.inList.size > 0 && compiled.inList.has(actualStr.toLowerCase());
    case "older_than":
    case "newer_than": {
      if (compiled.durationMs == null) {
        return false;
      }
      const ts = parseTimestampMs(actualStr);
      if (ts === null) {
        return false;
      }
      const age = compiled.now - ts;
      return filter.operator === "older_than" ? age >= compiled.durationMs : age <= compiled.durationMs;
    }
    default:
      return false;
  }
}

function matchesCompiled(item: object, compiled: CompiledFilter): boolean {
  const { filter } = compiled;

  if (filter.field === "") {
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

  if (
    filter.value === "" ||
    (filter.operator === "in" && (compiled.inList?.size ?? 0) === 0) ||
    ((filter.operator === "older_than" || filter.operator === "newer_than") && compiled.durationMs == null)
  ) {
    return true;
  }

  return normalized.some((v) => v !== undefined && v !== null && valuesMatch(compiled, v));
}

/** Group filters: consecutive `or` rows share a group; groups are ANDed. */
export function groupFiltersByCombinator(filters: FieldFilter[]): FieldFilter[][] {
  const groups: FieldFilter[][] = [];
  for (const filter of filters) {
    if (groups.length === 0 || (filter.combinator ?? "and") !== "or") {
      groups.push([filter]);
    } else {
      groups[groups.length - 1].push(filter);
    }
  }
  return groups;
}

export function matchesFilter(item: object, filter: FieldFilter): boolean {
  return matchesCompiled(item, compileFilter(filter));
}

export function matchesAllFilters(item: object, filters: FieldFilter[]): boolean {
  return createFilterMatcher(filters)(item);
}

export function createFilterMatcher(filters: FieldFilter[], now = Date.now()): (item: object) => boolean {
  const groups = groupFiltersByCombinator(filters).map((group) => group.map((filter) => compileFilter(filter, now)));
  return (item: object) => groups.every((group) => group.some((compiled) => matchesCompiled(item, compiled)));
}
