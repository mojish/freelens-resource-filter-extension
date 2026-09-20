/**
 * Regression specs for v0.3.1 fixes (preview reactivity, OR counts, jq JSON,
 * download projection, favorites, operator labels, no kind-specific leaks).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFilterMatcher, type FieldFilter } from "./filter-engine";
import { FilterStore } from "./filter-store";
import { buildKubectlYqCommand, type KubectlResourceRef } from "./kubectl-yq";
import { downloadPayload, projectItem } from "./download-matches";
import { loadFavoriteKinds, toggleFavoriteKind } from "./filter-storage";
import { filterOperators } from "./filter-engine";
import { filterItemsByNamespace } from "./namespace-scope";

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
): FieldFilter => ({ id: crypto.randomUUID?.() ?? Math.random().toString(36), field, operator, value, combinator });

describe("fix 1 — preview updates when a filter is removed", () => {
  it("drops the removed predicate from the generated command", () => {
    const store = new FilterStore();
    store.addFilter("spec.state", "=", "pending");
    store.addFilter("metadata.namespace", "=", "ns-a");
    const before = buildKubectlYqCommand(resource, store.activeFilters, "all", [], "yq");
    expect(before).toContain("spec.state");
    expect(before).toContain("metadata.namespace");

    store.removeFilter(store.filters[1].id);
    const after = buildKubectlYqCommand(resource, store.activeFilters, "all", [], "yq");
    expect(after).toContain("spec.state");
    expect(after).not.toContain("metadata.namespace");
    expect(after).not.toBe(before);
    expect(store.revision).toBeGreaterThan(0);
  });
});

describe("fix 2 — AND/OR toggle changes match counts", () => {
  it("matchSignature changes when combinator flips", () => {
    const store = new FilterStore();
    store.addFilter("spec.state", "=", "pending");
    store.addFilter("spec.state", "=", "ready");
    const sigAnd = store.matchSignature;

    store.updateFilter(store.filters[1].id, { combinator: "or" });
    expect(store.matchSignature).not.toBe(sigAnd);

    const items = [
      { spec: { state: "pending" } },
      { spec: { state: "ready" } },
      { spec: { state: "failed" } },
    ];
    const andMatcher = createFilterMatcher([
      row("spec.state", "=", "pending"),
      { ...row("spec.state", "=", "ready"), combinator: "and" },
    ]);
    const orMatcher = createFilterMatcher([
      row("spec.state", "=", "pending"),
      { ...row("spec.state", "=", "ready"), combinator: "or" },
    ]);
    expect(items.filter(andMatcher)).toHaveLength(0);
    expect(items.filter(orMatcher)).toHaveLength(2);
  });
});

describe("fix 8 — jq dialect uses kubectl -o json", () => {
  it("never pipes YAML into jq", () => {
    const cmd = buildKubectlYqCommand(resource, [row("spec.state", "=", "x")], ["ns-a"], ["status"], "jq");
    expect(cmd).toContain("-o json");
    expect(cmd).not.toMatch(/-o yaml\s*\|/);
    expect(cmd).toContain("| jq ");
  });

  it("keeps yaml for yq dialect", () => {
    const cmd = buildKubectlYqCommand(resource, [row("spec.state", "=", "x")], "all", [], "yq");
    expect(cmd).toContain("-o yaml | yq ");
  });
});

describe("fix 10 — download respects output fields", () => {
  it("projects only selected paths", () => {
    const item = {
      metadata: { name: "w1", namespace: "ns" },
      spec: { state: "pending", unused: true },
      status: { phase: "Ok" },
    };
    expect(projectItem(item, ["status", "metadata.name"])).toEqual({
      status: { phase: "Ok" },
      "metadata.name": "w1",
    });
    expect(downloadPayload([item], [item], ["status"])).toEqual([{ status: { phase: "Ok" } }]);
    expect(downloadPayload([item], [item], [])).toEqual([item]);
  });
});

describe("fix 14 — favorites persist across reload", () => {
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

  it("round-trips favorite kinds through localStorage", () => {
    expect(loadFavoriteKinds()).toEqual([]);
    expect(toggleFavoriteKind("example.com/v1/Widget")).toEqual(["example.com/v1/Widget"]);
    // Simulate restart: new load from same storage
    expect(loadFavoriteKinds()).toEqual(["example.com/v1/Widget"]);
    expect(toggleFavoriteKind("example.com/v1/Widget")).toEqual([]);
    expect(loadFavoriteKinds()).toEqual([]);
  });

  it("migrates legacy favorites/recent keys into ui-prefs", async () => {
    const { saveRecentKind, loadRecentKinds, loadPreviewOpen, savePreviewOpen } = await import("./filter-storage");
    // legacy keys written directly
    localStorage.setItem("frf:v1:favorites", JSON.stringify(["v1/Pod"]));
    localStorage.setItem("frf:v1:recent", JSON.stringify(["apps/v1/Deployment"]));
    localStorage.removeItem("frf:v1:ui-prefs");
    expect(loadFavoriteKinds()).toEqual(["v1/Pod"]);
    expect(loadRecentKinds()).toEqual(["apps/v1/Deployment"]);
    expect(localStorage.getItem("frf:v1:ui-prefs")).toContain("v1/Pod");
    saveRecentKind("v1/Service");
    expect(loadRecentKinds()[0]).toBe("v1/Service");
    savePreviewOpen(true);
    expect(loadPreviewOpen()).toBe(true);
  });
});

describe("fix 19 — older_than / newer_than are distinct operators", () => {
  it("exposes both as separate operator values", () => {
    expect(filterOperators).toContain("older_than");
    expect(filterOperators).toContain("newer_than");
    expect(filterOperators.indexOf("older_than")).not.toBe(filterOperators.indexOf("newer_than"));
  });

  it("store keeps newer_than when set (no silent flip)", () => {
    const store = new FilterStore();
    store.addFilter("metadata.creationTimestamp", "newer_than", "7d");
    expect(store.filters[0].operator).toBe("newer_than");
    store.updateFilter(store.filters[0].id, { operator: "older_than" });
    expect(store.filters[0].operator).toBe("older_than");
    store.updateFilter(store.filters[0].id, { operator: "newer_than" });
    expect(store.filters[0].operator).toBe("newer_than");
  });
});

describe("download honors namespace scope", () => {
  it("excludes items outside selected namespaces", () => {
    const items = [
      { metadata: { name: "a", namespace: "ns-a" }, spec: { x: 1 } },
      { metadata: { name: "b", namespace: "ns-b" }, spec: { x: 2 } },
    ];
    const scoped = filterItemsByNamespace(items, ["ns-a"]);
    expect(downloadPayload(items, scoped, ["metadata.name"])).toEqual([{ "metadata.name": "a" }]);
  });
});
