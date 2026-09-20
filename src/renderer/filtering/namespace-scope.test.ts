import { describe, expect, it } from "vitest";
import { filterItemsByNamespace, matchesNamespaceFilter } from "./namespace-scope";

describe("namespace-scope", () => {
  const items = [
    { metadata: { name: "a", namespace: "ns-a" } },
    { metadata: { name: "b", namespace: "ns-b" } },
    { metadata: { name: "cluster-scoped" } },
  ];

  it("keeps everything for all namespaces", () => {
    expect(filterItemsByNamespace(items, "all")).toHaveLength(3);
  });

  it("filters to selected namespaces and keeps cluster-scoped", () => {
    expect(filterItemsByNamespace(items, ["ns-a"]).map((i) => (i as { metadata: { name: string } }).metadata.name)).toEqual([
      "a",
      "cluster-scoped",
    ]);
  });

  it("matchesNamespaceFilter handles getNs()", () => {
    const obj = { getNs: () => "ns-b", metadata: {} };
    expect(matchesNamespaceFilter(obj, ["ns-b"])).toBe(true);
    expect(matchesNamespaceFilter(obj, ["ns-a"])).toBe(false);
  });
});
