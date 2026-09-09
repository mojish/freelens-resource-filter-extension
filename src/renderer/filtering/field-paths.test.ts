import { describe, expect, it } from "vitest";
import { collectFieldPaths, derivedColumns, fieldPathsOf, valueSuggestionsFor } from "./field-paths";

const items = [
  {
    metadata: { namespace: "a", name: "one" },
    spec: { state: "pending", tags: ["x", "y"] },
    status: { conditions: [{ type: "Ready", status: "True" }] },
  },
  {
    metadata: { namespace: "b", name: "two" },
    spec: { state: "valid", tags: ["z"] },
    status: { conditions: [{ type: "Ready", status: "False" }] },
  },
  { metadata: { namespace: "a", name: "three" }, spec: { other: "value" } },
];

describe("collectFieldPaths", () => {
  it("collects scalar paths", () => {
    const catalog = collectFieldPaths(items);
    expect(fieldPathsOf(catalog)).toContain("metadata.namespace");
    expect(fieldPathsOf(catalog)).toContain("spec.state");
  });

  it("uses canonical array paths without a stray dot", () => {
    const catalog = collectFieldPaths(items);
    const paths = fieldPathsOf(catalog);
    expect(paths).toContain("spec.tags[*]");
    expect(paths).toContain("status.conditions[*].type");
    expect(paths.some((p) => p.includes(".[*]"))).toBe(false);
  });

  it("records distinct values per path", () => {
    const catalog = collectFieldPaths(items);
    expect(valueSuggestionsFor(catalog, "metadata.namespace")).toEqual(["a", "b"]);
    expect(valueSuggestionsFor(catalog, "spec.state")).toEqual(["pending", "valid"]);
  });

  it("returns empty suggestions for unknown paths", () => {
    const catalog = collectFieldPaths(items);
    expect(valueSuggestionsFor(catalog, "nope.nope")).toEqual([]);
  });

  it("handles empty input", () => {
    expect(fieldPathsOf(collectFieldPaths([]))).toEqual([]);
  });

  it("caps total paths", () => {
    const wide = Array.from({ length: 10 }, (_, i) => Object.fromEntries(Array.from({ length: 100 }, (_, j) => [`k${i}_${j}`, "v"])));
    const paths = fieldPathsOf(collectFieldPaths(wide));
    expect(paths.length).toBeLessThanOrEqual(500);
  });
});

describe("presence and derived columns", () => {
  it("counts presence once per item even for multi-element arrays", () => {
    const catalog = collectFieldPaths([{ spec: { tags: ["a", "b", "c"] } }, { spec: { tags: [] } }]);
    expect(catalog.presenceByPath.get("spec.tags[*]")).toBe(1);
    expect(catalog.sampleSize).toBe(2);
  });

  it("derives top spec/status scalar columns by presence", () => {
    const catalog = collectFieldPaths(items);
    const columns = derivedColumns(catalog);
    // spec.state is present in 2/3 items, spec.other in 1/3, status conditions are arrays (excluded)
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.length).toBeLessThanOrEqual(2);
    expect(columns[0].path).toBe("spec.state");
    expect(columns[0].title).toBe("state");
  });

  it("prefers higher presence, then shorter paths", () => {
    const catalog = collectFieldPaths([
      { spec: { aaa: "1", b: "2" } },
      { spec: { aaa: "2", b: "3" } },
      { spec: { aaa: "3", b: "4" } },
      { spec: { c: "5" } },
    ]);
    const columns = derivedColumns(catalog);
    expect(columns.map((c) => c.path)).toEqual(["spec.b", "spec.aaa"]);
  });

  it("uses full path titles when suffixes collide", () => {
    const catalog = collectFieldPaths([{ spec: { state: "a" }, status: { state: "b" } }]);
    const columns = derivedColumns(catalog, 2);
    expect(columns.map((c) => c.title)).toContain("spec.state");
    expect(columns.map((c) => c.title)).toContain("status.state");
  });

  it("returns no columns for empty catalogs", () => {
    expect(derivedColumns(collectFieldPaths([]))).toEqual([]);
  });
});
