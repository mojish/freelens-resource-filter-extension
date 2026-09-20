/**
 * Feature specs for Resource Filter v0.3 (items still supported after cleanup).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFilterMatcher,
  filterOperators,
  matchesFilter,
  type FieldFilter,
} from "./filter-engine";
import { parseFilterQuery, serializeFilterQuery } from "./filter-query";
import { buildKubectlYqCommand, type KubectlResourceRef } from "./kubectl-yq";
import { parseRelativeDurationMs } from "./time-value";
import { emptyMatchHints } from "./empty-state";
import { itemsFingerprint, shouldRebuildCatalog } from "./catalog-fingerprint";
import { valueSuggestionsFromItems } from "./filtered-values";
import {
  loadFilterSets,
  loadKindSession,
  loadRecentKinds,
  saveFilterSet,
  saveKindSession,
  saveRecentKind,
  toggleFavoriteKind,
  loadFavoriteKinds,
} from "./filter-storage";
import { groupKindsByApiGroup, kindSearchRank } from "./kind-picker";
import { OPERATOR_HELP, PATH_WILDCARD_HELP } from "./semantic-docs";
import { SAMPLE_SIZE } from "./field-paths";
import { formatNamespaceBadge } from "./namespace-badge";

const resource: KubectlResourceRef = {
  apiResource: "widgets",
  apiVersionWithGroup: "example.com/v1",
  kind: "Widget",
  isNamespaced: true,
};

const row = (
  field: string,
  operator: FieldFilter["operator"],
  value: string,
  combinator: FieldFilter["combinator"] = "and",
): FieldFilter => ({ id: "t", field, operator, value, combinator });

describe("item 1 — live command preview helpers", () => {
  it("builds a stable command string for the preview box", () => {
    const cmd = buildKubectlYqCommand(
      resource,
      [row("spec.entries[*][*].type", "=", "AAAA")],
      ["ns-a"],
      ["status"],
    );
    expect(cmd).toContain("kubectl get");
    expect(cmd).toContain("| yq ");
    expect(cmd).toContain("ns-a");
    expect(cmd).toContain(".status");
  });

  it("reports match counts as matched/total", () => {
    const items = [
      { metadata: { name: "a" }, spec: { state: "pending" } },
      { metadata: { name: "b" }, spec: { state: "ready" } },
      { metadata: { name: "c" }, spec: { state: "pending" } },
    ];
    const matcher = createFilterMatcher([row("spec.state", "=", "pending")]);
    const matched = items.filter(matcher).length;
    expect(`${matched} / ${items.length}`).toBe("2 / 3");
  });
});

describe("item 2 — OR groups", () => {
  it("ANDs rows by default", () => {
    const item = { metadata: { namespace: "a" }, spec: { state: "pending" } };
    const matcher = createFilterMatcher([
      row("metadata.namespace", "=", "a"),
      row("spec.state", "=", "pending"),
    ]);
    expect(matcher(item)).toBe(true);
    expect(matcher({ metadata: { namespace: "a" }, spec: { state: "ready" } })).toBe(false);
  });

  it("ORs consecutive rows marked combinator=or within an AND of groups", () => {
    const matcher = createFilterMatcher([
      row("spec.state", "=", "pending"),
      { ...row("spec.state", "=", "valid"), combinator: "or" },
      row("metadata.namespace", "=", "a"),
    ]);
    expect(matcher({ metadata: { namespace: "a" }, spec: { state: "pending" } })).toBe(true);
    expect(matcher({ metadata: { namespace: "a" }, spec: { state: "valid" } })).toBe(true);
    expect(matcher({ metadata: { namespace: "a" }, spec: { state: "failed" } })).toBe(false);
    expect(matcher({ metadata: { namespace: "b" }, spec: { state: "pending" } })).toBe(false);
  });
});

describe("item 3 — persist output fields in sets", () => {
  class FakeStorage implements Storage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    clear() {
      this.map.clear();
    }
    getItem(key: string) {
      return this.map.get(key) ?? null;
    }
    key(index: number) {
      return [...this.map.keys()][index] ?? null;
    }
    removeItem(key: string) {
      this.map.delete(key);
    }
    setItem(key: string, value: string) {
      this.map.set(key, value);
    }
  }

  beforeEach(() => {
    vi.stubGlobal("localStorage", new FakeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores outputFields and columns on saved sets", () => {
    saveFilterSet("v1/Pod", "mine", [{ field: "spec.state", operator: "=", value: "x", combinator: "and" }], {
      outputFields: ["status"],
      columns: ["status.phase"],
    });
    const set = loadFilterSets("v1/Pod")[0];
    expect(set.outputFields).toEqual(["status"]);
    expect(set.columns).toEqual(["status.phase"]);
  });

  it("persists per-kind session output/columns/dialect", () => {
    saveKindSession("v1/Pod", { outputFields: ["spec"], columns: ["status.phase"], dialect: "jq" });
    expect(loadKindSession("v1/Pod")).toEqual({
      outputFields: ["spec"],
      columns: ["status.phase"],
      dialect: "jq",
    });
  });
});

describe("item 4 — empty match hints + catalog sampling", () => {
  it("exposes SAMPLE_SIZE for the catalog banner", () => {
    expect(SAMPLE_SIZE).toBe(200);
  });

  it("suggests closest fields and clear/exists when nothing matches", () => {
    const hints = emptyMatchHints({
      filters: [row("spec.entryz[*].type", "=", "AAAA")],
      knownPaths: ["spec.entries[*][*].type", "spec.state", "metadata.name"],
    });
    expect(hints.some((h) => h.includes("spec.entries"))).toBe(true);
    expect(hints.some((h) => /exists|clear/i.test(h))).toBe(true);
  });
});

describe("item 5 — keyboard field picker helpers", () => {
  it("resolveFieldPathPick still prefers exact / typed paths (regression)", async () => {
    const { resolveFieldPathPick } = await import("./field-path-search");
    const paths = ["spec.entries", "spec.entries[*][*].type"];
    expect(resolveFieldPathPick(paths, "spec.entries")).toBe("spec.entries");
  });
});

describe("item 6 — query bar parse/serialize", () => {
  it("parses AND/OR queries into filter rows", () => {
    const parsed = parseFilterQuery(
      "spec.state = pending OR spec.state = valid AND metadata.namespace = ns-a",
    );
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ field: "spec.state", operator: "=", value: "pending", combinator: "and" });
    expect(parsed[1]).toMatchObject({ field: "spec.state", operator: "=", value: "valid", combinator: "or" });
    expect(parsed[2]).toMatchObject({
      field: "metadata.namespace",
      operator: "=",
      value: "ns-a",
      combinator: "and",
    });
  });

  it("round-trips through serialize", () => {
    const rows = parseFilterQuery("spec.entries[*][*].type = AAAA");
    expect(serializeFilterQuery(rows)).toContain("spec.entries[*][*].type");
    expect(serializeFilterQuery(rows)).toContain("AAAA");
  });
});

describe("item 7 — value suggestions from filtered set", () => {
  it("only returns values present in the remaining items", () => {
    const items = [
      { metadata: { namespace: "a" }, spec: { type: "AAAA" } },
      { metadata: { namespace: "b" }, spec: { type: "A" } },
      { metadata: { namespace: "a" }, spec: { type: "A" } },
    ];
    const remaining = items.filter((item) => item.spec.type === "AAAA");
    expect(valueSuggestionsFromItems(remaining, "metadata.namespace")).toEqual(["a"]);
  });
});

describe("item 8 — kubectl dialect", () => {
  it("builds mikefarah yq by default", () => {
    const cmd = buildKubectlYqCommand(resource, [row("spec.state", "=", "x")], "all", [], "yq");
    expect(cmd).toContain("| yq ");
    expect(cmd).toContain("downcase");
    expect(cmd).toContain("-o yaml");
  });

  it("builds jq dialect with JSON output", () => {
    const cmd = buildKubectlYqCommand(resource, [row("spec.state", "=", "x")], "all", [], "jq");
    expect(cmd).toContain("| jq ");
    expect(cmd).toContain("-o json");
  });
});

describe("item 15 — namespace badge label", () => {
  it("formats all vs single vs multi", () => {
    expect(formatNamespaceBadge("all")).toBe("All namespaces");
    expect(formatNamespaceBadge(["ns-a"])).toBe("Namespace: ns-a");
    expect(formatNamespaceBadge(["a", "b"])).toBe("Namespaces: a, b");
  });
});

describe("item 16 — catalog fingerprint debounce", () => {
  it("skips rebuild when fingerprint is unchanged", () => {
    const items = [
      { metadata: { uid: "1", resourceVersion: "10" } },
      { metadata: { uid: "2", resourceVersion: "20" } },
    ];
    const fp = itemsFingerprint(items);
    expect(shouldRebuildCatalog(undefined, fp, 2)).toBe(true);
    expect(shouldRebuildCatalog(fp, fp, 2)).toBe(false);
    expect(shouldRebuildCatalog(fp, itemsFingerprint([{ metadata: { uid: "1", resourceVersion: "11" } }]), 1)).toBe(
      true,
    );
  });
});

describe("item 18 — semantic docs", () => {
  it("documents [*] and != semantics", () => {
    expect(PATH_WILDCARD_HELP.toLowerCase()).toContain("any");
    expect(OPERATOR_HELP["!="]?.toLowerCase()).toContain("any");
  });
});

describe("item 19 — time operators", () => {
  it("exposes older_than and newer_than operators", () => {
    expect(filterOperators).toContain("older_than");
    expect(filterOperators).toContain("newer_than");
  });

  it("parses relative durations", () => {
    expect(parseRelativeDurationMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseRelativeDurationMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(parseRelativeDurationMs("30m")).toBe(30 * 60 * 1000);
    expect(parseRelativeDurationMs("bad")).toBeNull();
  });

  it("matches creationTimestamp older_than", () => {
    const old = { metadata: { creationTimestamp: "2020-01-01T00:00:00Z" } };
    const fresh = { metadata: { creationTimestamp: new Date().toISOString() } };
    expect(matchesFilter(old, row("metadata.creationTimestamp", "older_than", "7d"))).toBe(true);
    expect(matchesFilter(fresh, row("metadata.creationTimestamp", "older_than", "7d"))).toBe(false);
  });

  it("matches creationTimestamp newer_than", () => {
    const fresh = { metadata: { creationTimestamp: new Date().toISOString() } };
    const old = { metadata: { creationTimestamp: "2020-01-01T00:00:00Z" } };
    expect(matchesFilter(fresh, row("metadata.creationTimestamp", "newer_than", "7d"))).toBe(true);
    expect(matchesFilter(old, row("metadata.creationTimestamp", "newer_than", "7d"))).toBe(false);
  });
});

describe("item 14 — kind picker helpers + favorites", () => {
  it("groups by API group", () => {
    const groups = groupKindsByApiGroup([
      { id: "v1/Pod", apiVersionWithGroup: "v1", kind: "Pod" },
      { id: "apps/v1/Deployment", apiVersionWithGroup: "apps/v1", kind: "Deployment" },
      { id: "v1/Service", apiVersionWithGroup: "v1", kind: "Service" },
    ]);
    expect(groups.get("v1")?.map((r) => r.kind)).toEqual(["Pod", "Service"]);
    expect(groups.get("apps")?.map((r) => r.kind)).toEqual(["Deployment"]);
  });

  it("ranks favorites and recent higher", () => {
    expect(kindSearchRank("Pod", "pod", { favorite: true, recentIndex: 0 })).toBeGreaterThan(
      kindSearchRank("Pod", "pod", { favorite: false, recentIndex: -1 }),
    );
  });

  class FakeStorage implements Storage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    clear() {
      this.map.clear();
    }
    getItem(key: string) {
      return this.map.get(key) ?? null;
    }
    key(index: number) {
      return [...this.map.keys()][index] ?? null;
    }
    removeItem(key: string) {
      this.map.delete(key);
    }
    setItem(key: string, value: string) {
      this.map.set(key, value);
    }
  }

  beforeEach(() => {
    vi.stubGlobal("localStorage", new FakeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggles favorites and tracks recent", () => {
    expect(toggleFavoriteKind("v1/Pod")).toEqual(["v1/Pod"]);
    expect(loadFavoriteKinds()).toEqual(["v1/Pod"]);
    expect(toggleFavoriteKind("v1/Pod")).toEqual([]);
    saveRecentKind("v1/Pod");
    saveRecentKind("apps/v1/Deployment");
    expect(loadRecentKinds()[0]).toBe("apps/v1/Deployment");
  });
});
