/**
 * Smart matching / ranking for field-path search boxes (filter rows + kubectl output).
 *
 * Whitespace-separated tokens are joined with `.*` (after escaping), so typing
 * `record type` matches `spec.records[*][*].type`. Ranking prefers exact and
 * prefix hits, then segment-aligned / wildcard-friendly paths over deep named keys.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s.]+/)
    .map((token) => token.replace(/\[\*\]/g, "").replace(/\[\d+\]/g, ""))
    .filter((token) => token.length > 0 && token !== "*" && token !== "@");
}

/** Path segments with brackets stripped for matching, e.g. `records[*]` → `records`. */
function pathSegments(path: string): string[] {
  return path
    .toLowerCase()
    .split(".")
    .map((segment) => segment.replace(/\[\d+\]/g, "").replace(/\[\*\]/g, "").replace(/^\[|\]$/g, ""))
    .filter((segment) => segment.length > 0);
}

/** Does `path` match the user's search query? Empty query matches everything. */
export function matchesFieldPathQuery(path: string, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === "") {
    return true;
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return true;
  }

  if (tokens.length > 1) {
    const pattern = tokens.map(escapeRegExp).join(".*");
    try {
      return new RegExp(pattern, "i").test(path);
    } catch {
      return false;
    }
  }

  const token = tokens[0];
  if (path.toLowerCase().includes(token.toLowerCase())) {
    return true;
  }

  try {
    return new RegExp(token, "i").test(path);
  } catch {
    return false;
  }
}

/**
 * Higher is better. Used by both the filter field picker and kubectl output picker.
 *
 * Priorities:
 * 1. Exact / prefix match on the full query
 * 2. Tokens aligning to path segments (record→records, type→type)
 * 3. Last token at the end of the path
 * 4. Wildcard fan-out (`[*]`) over concrete map keys (`sapi`, `@`)
 * 5. Shallower / shorter paths
 */
export function fieldPathMatchScore(path: string, query: string): number {
  const trimmed = query.trim();
  if (trimmed === "") {
    return 0;
  }

  const pathLower = path.toLowerCase();
  const queryLower = trimmed.toLowerCase();
  let score = 0;

  if (pathLower === queryLower) {
    return 1_000_000;
  }
  if (pathLower.startsWith(queryLower)) {
    score += 100_000;
  }

  const tokens = queryTokens(trimmed);
  if (tokens.length === 0) {
    return score - path.length;
  }

  const segments = pathSegments(path);
  let lastMatchIndex = -1;
  let firstMatchIndex = -1;

  for (const token of tokens) {
    let found = -1;
    for (let index = lastMatchIndex + 1; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment === token || segment.startsWith(token)) {
        found = index;
        break;
      }
    }
    if (found === -1) {
      // token only matched as a loose substring somewhere — small credit
      if (pathLower.includes(token)) {
        score += 10;
      }
      continue;
    }
    score += segments[found] === token ? 500 : 220;
    if (firstMatchIndex === -1) {
      firstMatchIndex = found;
    }
    lastMatchIndex = found;
  }

  if (firstMatchIndex >= 0 && lastMatchIndex >= firstMatchIndex) {
    // Prefer compact token spans (records…type with little in between)
    const span = lastMatchIndex - firstMatchIndex;
    score += Math.max(0, 80 - span * 25);
  }

  const lastToken = tokens[tokens.length - 1];
  const lastSegment = segments[segments.length - 1];
  if (lastSegment === lastToken) {
    score += 400;
  } else if (lastSegment?.startsWith(lastToken)) {
    score += 150;
  }

  // Wildcard map/array fan-out is usually what multi-word searches want
  const wildcards = (path.match(/\[\*\]/g) ?? []).length;
  score += wildcards * 120;

  // Concrete map keys between dots (dns names, "@") are less useful for generic queries
  const concreteMapKeys = (path.match(/\.[^.\[]+\[/g) ?? []).length;
  score -= concreteMapKeys * 90;
  if (path.includes(".@") || path.includes('["@"]')) {
    score -= 60;
  }

  score -= segments.length * 20;
  score -= path.length;

  return score;
}

/** Rank matching paths for display / Enter selection. */
export function rankFieldPathMatches(paths: string[], query: string): string[] {
  const trimmed = query.trim();
  const matched = paths.filter((path) => matchesFieldPathQuery(path, trimmed));
  if (trimmed === "") {
    return matched.sort((a, b) => a.localeCompare(b));
  }

  return matched.sort((a, b) => {
    const scoreDiff = fieldPathMatchScore(b, trimmed) - fieldPathMatchScore(a, trimmed);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.localeCompare(b);
  });
}

/** True when the typed text looks like an intentional field path. */
export function looksLikeFieldPath(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && /^[A-Za-z_@][\w.\[\]*"'@-]*$/.test(trimmed) && /[.\[]/.test(trimmed);
}

/**
 * Resolve what Enter should select: exact catalog hit, freeform typed path, or
 * the top ranked match. Returns null when there is nothing sensible to pick.
 */
export function resolveFieldPathPick(paths: string[], query: string): string | null {
  const trimmed = query.trim();
  const ranked = rankFieldPathMatches(paths, trimmed);

  if (trimmed !== "") {
    const exact = ranked.find((path) => path.toLowerCase() === trimmed.toLowerCase());
    if (exact) {
      return exact;
    }
    if (paths.includes(trimmed)) {
      return trimmed;
    }
    if (looksLikeFieldPath(trimmed)) {
      return trimmed;
    }
  }

  return ranked[0] ?? null;
}

/**
 * `filterOption` adapter for Freelens/react-select Select.
 * Tolerates both the raw option shape and FilterOptionOption wrapping.
 */
export function fieldPathFilterOption(
  option: {
    label?: string;
    value?: string;
    data?: { label?: string; value?: string };
  },
  inputValue: string,
): boolean {
  const path =
    option.data?.value ?? option.data?.label ?? option.value ?? option.label ?? "";
  return matchesFieldPathQuery(String(path), inputValue);
}
