/**
 * Field path collector: walks a sample of resource items and collects the deep
 * field paths (e.g. `metadata.namespace`, `spec.state`, `status.conditions[*].type`),
 * plus the unique scalar values observed at each path for input suggestions,
 * and how many sampled items carry each path (presence) for column derivation.
 */

const MAX_PATHS = 500;
const MAX_VALUE_SUGGESTIONS = 100;
const MAX_ARRAY_DEPTH = 3;
const SAMPLE_SIZE = 200;

/** Collected field metadata for one resource kind. */
export interface FieldCatalog {
  /** path -> distinct scalar values observed (capped) */
  valuesByPath: Map<string, Set<string>>;
  /** path -> number of sampled items that carry the path */
  presenceByPath: Map<string, number>;
  /** number of items the catalog was built from */
  sampleSize: number;
}

export interface DerivedColumn {
  /** full field path, e.g. `spec.state` */
  path: string;
  /** column title, e.g. `State` */
  title: string;
}

interface WalkContext {
  valuesByPath: Map<string, Set<string>>;
  presenceByPath: Map<string, number>;
  /** (itemIndex, path) pairs already counted for presence */
  presenceSeen: Set<string>;
}

/** Collect dotted field paths (arrays become `path[*]`) from a sample of items. */
export function collectFieldPaths(items: object[]): FieldCatalog {
  const valuesByPath = new Map<string, Set<string>>();
  const presenceByPath = new Map<string, number>();
  const presenceSeen = new Set<string>();
  const sample = items.slice(0, SAMPLE_SIZE);

  sample.forEach((item, itemIndex) => {
    walk(item, [], { valuesByPath, presenceByPath, presenceSeen }, itemIndex, 0);
  });

  return { valuesByPath, presenceByPath, sampleSize: sample.length };
}

function walk(node: unknown, prefix: string[], ctx: WalkContext, itemIndex: number, depth: number): void {
  if (node == null || typeof node !== "object" || ctx.valuesByPath.size > MAX_PATHS) {
    return;
  }

  if (Array.isArray(node)) {
    const path = prefix.length > 0 ? `${prefix.join(".")}[*]` : "[*]";

    for (const element of node) {
      recordValue(ctx.valuesByPath, path, element);

      if (element != null && typeof element === "object" && depth < MAX_ARRAY_DEPTH) {
        // also walk into object array elements: `path[*].field`
        // (append `[*]` to the last prefix element to keep the canonical form `a.b[*].c`)
        const nestedPrefix =
          prefix.length > 0 ? [...prefix.slice(0, -1), `${prefix[prefix.length - 1]}[*]`] : ["[*]"];
        walk(element, nestedPrefix, ctx, itemIndex, depth + 1);
      }
    }

    if (node.length > 0) {
      markPresence(ctx, path, itemIndex);
    }
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = [...prefix, key].join(".");

    if (value == null || typeof value !== "object") {
      recordValue(ctx.valuesByPath, path, value);
      if (value !== undefined) {
        markPresence(ctx, path, itemIndex);
      }
      continue;
    }

    if (ctx.valuesByPath.has(path) || ctx.valuesByPath.size < MAX_PATHS) {
      walk(value, [...prefix, key], ctx, itemIndex, depth);
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

/** Count a path as present for one item, at most once per (item, path). */
function markPresence(ctx: WalkContext, path: string, itemIndex: number): void {
  const seenKey = `${itemIndex}\u0000${path}`;
  if (ctx.presenceSeen.has(seenKey)) {
    return;
  }
  ctx.presenceSeen.add(seenKey);
  ctx.presenceByPath.set(path, (ctx.presenceByPath.get(path) ?? 0) + 1);
}

/** Sorted field paths for the field dropdown. */
export function fieldPathsOf(catalog: FieldCatalog): string[] {
  return [...catalog.valuesByPath.keys()].sort((a, b) => a.localeCompare(b));
}

/** Value suggestions (unique, sorted) for a specific field path. */
export function valueSuggestionsFor(catalog: FieldCatalog, path: string): string[] {
  return [...(catalog.valuesByPath.get(path) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
}

/**
 * Pick up to two sortable columns derived from the data itself: scalar leaf
 * paths under `spec.`/`status.` that most sampled items carry. Arrays and deep
 * paths are excluded to keep the table readable.
 */
export function derivedColumns(catalog: FieldCatalog, limit = 2): DerivedColumn[] {
  const { presenceByPath, sampleSize } = catalog;
  if (sampleSize === 0) {
    return [];
  }

  const candidates: { path: string; presence: number }[] = [];

  for (const [path, count] of presenceByPath) {
    if (!path.startsWith("spec.") && !path.startsWith("status.")) {
      continue;
    }
    if (path.includes("[") || path.split(".").length > 3) {
      continue;
    }
    // only paths that are also plain scalar leaves in the value catalog
    if (!catalog.valuesByPath.has(path)) {
      continue;
    }
    candidates.push({ path, presence: count });
  }

  const chosen = candidates
    .sort((a, b) => b.presence - a.presence || a.path.length - b.path.length)
    .slice(0, limit);

  // dedupe titles: fall back to the full path when two columns share a suffix
  const titles = chosen.map((c) => c.path.split(".").pop() ?? c.path);
  const titleCounts = new Map<string, number>();
  for (const t of titles) {
    titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
  }

  return chosen.map((c, i) => ({
    path: c.path,
    title: (titleCounts.get(titles[i]) ?? 0) > 1 ? c.path : titles[i],
  }));
}
