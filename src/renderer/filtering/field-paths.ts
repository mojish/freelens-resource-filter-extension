/**
 * Field path collector: walks a sample of resource items and collects the deep
 * field paths (e.g. `metadata.namespace`, `spec.state`, `status.conditions[*].type`),
 * plus the unique scalar values observed at each path for input suggestions.
 */

const MAX_PATHS = 500;
const MAX_VALUE_SUGGESTIONS = 100;
const MAX_ARRAY_DEPTH = 3;
const SAMPLE_SIZE = 200;

/** Field path -> observed distinct values. */
export type FieldCatalog = Map<string, Set<string>>;

export interface FieldCatalogEntry {
  path: string;
  valueCount: number;
}

/** Collect dotted field paths (arrays become `path[*]` and `path[i]`) from a sample of items. */
export function collectFieldPaths(items: object[]): Map<string, Set<string>> {
  const valuesByPath = new Map<string, Set<string>>();
  const sample = items.slice(0, SAMPLE_SIZE);

  for (const item of sample) {
    walk(item, [], valuesByPath, 0);
  }

  return valuesByPath;
}

function walk(
  node: unknown,
  prefix: string[],
  valuesByPath: Map<string, Set<string>>,
  depth: number,
): void {
  if (node == null || typeof node !== "object" || valuesByPath.size > MAX_PATHS) {
    return;
  }

  if (Array.isArray(node)) {
    const path = prefix.length > 0 ? `${prefix.join(".")}[*]` : "[*]";

    // record array elements that are scalars as values of `path[*]`
    for (const element of node) {
      recordValue(valuesByPath, path, element);

      if (element != null && typeof element === "object" && depth < MAX_ARRAY_DEPTH) {
        // also walk into object array elements: `path[*].field`
        // (append `[*]` to the last prefix element to keep the canonical form `a.b[*].c`)
        const nestedPrefix = prefix.length > 0 ? [...prefix.slice(0, -1), `${prefix[prefix.length - 1]}[*]`] : ["[*]"];
        walk(element, nestedPrefix, valuesByPath, depth + 1);
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = [...prefix, key].join(".");

    if (value == null || typeof value !== "object") {
      recordValue(valuesByPath, path, value);
      continue;
    }

    if (valuesByPath.has(path) || valuesByPath.size < MAX_PATHS) {
      walk(value, [...prefix, key], valuesByPath, depth);
    }
  }
}

function recordValue(valuesByPath: Map<string, Set<string>>, path: string, value: unknown): void {
  if (value == null || typeof value === "object") {
    return;
  }

  let set = valuesByPath.get(path);
  if (!set) {
    if (valuesByPath.size >= MAX_PATHS) {
      return;
    }
    set = new Set();
    valuesByPath.set(path, set);
  }
  if (set.size < MAX_VALUE_SUGGESTIONS) {
    set.add(String(value));
  }
}

/** Sorted field paths for the field dropdown. */
export function fieldPathsOf(catalog: Map<string, Set<string>>): string[] {
  return [...catalog.keys()].sort((a, b) => a.localeCompare(b));
}

/** Value suggestions (unique, sorted) for a specific field path. */
export function valueSuggestionsFor(catalog: Map<string, Set<string>>, path: string): string[] {
  return [...(catalog.get(path) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
}

/** Summary entry list (path + distinct-value count) for a compact catalog overview. */
export function fieldCatalogEntries(catalog: Map<string, Set<string>>): FieldCatalogEntry[] {
  return [...catalog.entries()].map(([path, values]) => ({ path, valueCount: values.size }));
}
