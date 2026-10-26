/**
 * Kind picker helpers: group by API group and rank search hits.
 */

export interface KindRef {
  id: string;
  apiVersionWithGroup: string;
  kind: string;
}

/** Group kinds by API group (the part before `/` in apiVersionWithGroup, or the core API version). */
export function groupKindsByApiGroup(resources: KindRef[]): Map<string, KindRef[]> {
  const groups = new Map<string, KindRef[]>();
  for (const resource of resources) {
    const slash = resource.apiVersionWithGroup.indexOf("/");
    const group = slash === -1 ? "core" : resource.apiVersionWithGroup.slice(0, slash) || "core";
    // core APIs are just "v1"
    const key = slash === -1 ? resource.apiVersionWithGroup : group;
    const list = groups.get(key) ?? [];
    list.push(resource);
    groups.set(key, list);
  }
  return groups;
}

export interface KindRankContext {
  favorite: boolean;
  /** 0 = most recent; -1 = not recent */
  recentIndex: number;
}

/** Higher score = better match for the kind search box. */
export function kindSearchRank(kind: string, query: string, ctx: KindRankContext): number {
  const q = query.trim().toLowerCase();
  const name = kind.toLowerCase();
  let score = 0;
  if (q === "") {
    score = 1;
  } else if (name === q) {
    score = 100;
  } else if (name.startsWith(q)) {
    score = 80;
  } else if (name.includes(q)) {
    score = 50;
  } else {
    return ctx.favorite ? 5 : 0;
  }
  if (ctx.favorite) {
    score += 25;
  }
  if (ctx.recentIndex >= 0) {
    score += Math.max(0, 15 - ctx.recentIndex);
  }
  return score;
}
