import { describe, expect, it } from "vitest";
import {
  createFilterMatcher,
  filterOperators,
  getFieldValues,
  matchesAllFilters,
  matchesFilter,
} from "./filter-engine";

const challenge = {
  metadata: { namespace: "digifyshop", name: "ch-1" },
  spec: { state: "pending", tags: ["x", "y"], replicas: 2, enabled: true },
  status: { phase: "Ready", conditions: [{ type: "Ready", status: "True" }, { type: "Valid", status: "False" }] },
};

const filter = (field: string, operator: string, value: string) =>
  matchesFilter(challenge, { id: "t", field, operator: operator as never, value });

describe("getFieldValues", () => {
  it("resolves plain paths", () => {
    expect(getFieldValues(challenge, "spec.state")).toEqual(["pending"]);
  });

  it("resolves missing paths to empty", () => {
    expect(getFieldValues(challenge, "spec.missing")).toEqual([undefined]);
  });

  it("fans out arrays with [*]", () => {
    expect(getFieldValues(challenge, "spec.tags[*]")).toEqual(["x", "y"]);
  });

  it("fans out object arrays with [*].field", () => {
    expect(getFieldValues(challenge, "status.conditions[*].type")).toEqual(["Ready", "Valid"]);
  });

  it("resolves explicit array indices", () => {
    expect(getFieldValues(challenge, "status.conditions[0].type")).toEqual(["Ready"]);
    expect(getFieldValues(challenge, "status.conditions[5].type")).toEqual([]);
  });

  it("tolerates the dotted bracket form a.b.[*].c", () => {
    expect(getFieldValues(challenge, "status.conditions.[*].type")).toEqual(["Ready", "Valid"]);
  });
});

describe("operators", () => {
  it("= matches strings case-insensitively", () => {
    expect(filter("spec.state", "=", "pending")).toBe(true);
    expect(filter("spec.state", "=", "PENDING")).toBe(true);
    expect(filter("spec.state", "=", "ready")).toBe(false);
  });

  it("= matches numbers numerically", () => {
    expect(filter("spec.replicas", "=", "2")).toBe(true);
    expect(filter("spec.replicas", "=", "2.0")).toBe(true);
    expect(filter("spec.replicas", "=", "10")).toBe(false);
  });

  it("= matches booleans by name", () => {
    expect(filter("spec.enabled", "=", "true")).toBe(true);
    expect(filter("spec.enabled", "=", "TRUE")).toBe(true);
    expect(filter("spec.enabled", "=", "false")).toBe(false);
  });

  it("!= negates =", () => {
    expect(filter("spec.state", "!=", "ready")).toBe(true);
    expect(filter("spec.state", "!=", "pending")).toBe(false);
  });

  it("contains is substring, case-insensitive", () => {
    expect(filter("metadata.namespace", "contains", "DIGIFY")).toBe(true);
    expect(filter("metadata.namespace", "contains", "shop")).toBe(true);
    expect(filter("metadata.namespace", "!contains", "shop")).toBe(false);
  });

  it("regex matches any array element", () => {
    expect(filter("status.conditions[*].type", "regex", "^Ready$")).toBe(true);
    expect(filter("status.conditions[*].type", "regex", "^Missing$")).toBe(false);
  });

  it("regex never throws on invalid patterns", () => {
    expect(filter("spec.state", "regex", "([unclosed")).toBe(false);
  });

  it("in matches any comma-separated value, case-insensitive, trimmed", () => {
    expect(filter("spec.state", "in", "pending, valid")).toBe(true);
    expect(filter("spec.state", "in", "PENDING,ready")).toBe(true);
    expect(filter("spec.state", "in", "ready , failed")).toBe(false);
  });

  it("in fans out over arrays", () => {
    expect(filter("spec.tags[*]", "in", "y, z")).toBe(true);
    expect(filter("spec.tags[*]", "in", "q")).toBe(false);
  });

  it("in with only commas is disabled", () => {
    expect(filter("spec.state", "in", " , ")).toBe(true);
  });

  it("exists is true when any value is present", () => {
    expect(filter("spec.state", "exists", "")).toBe(true);
    expect(filter("spec.missing", "exists", "")).toBe(false);
    expect(filter("spec.state.deep", "exists", "")).toBe(false);
  });

  it("!exists is the inverse", () => {
    expect(filter("spec.state.deep", "!exists", "")).toBe(true);
    expect(filter("spec.state", "!exists", "")).toBe(false);
  });
});

describe("row disabling", () => {
  it("empty value disables value operators", () => {
    expect(filter("spec.state", "=", "")).toBe(true);
    expect(filter("spec.state", "!=", "")).toBe(true);
  });

  it("empty field disables the row", () => {
    expect(matchesFilter(challenge, { id: "t", field: "", operator: "=", value: "pending" })).toBe(true);
  });
});

describe("matchesAllFilters", () => {
  const rows = [
    { id: "a", field: "spec.state", operator: "=" as const, value: "pending" },
    { id: "b", field: "metadata.namespace", operator: "=" as const, value: "digifyshop" },
  ];

  it("ANDs all rows", () => {
    expect(matchesAllFilters(challenge, rows)).toBe(true);
    expect(
      matchesAllFilters(challenge, [
        ...rows,
        { id: "c", field: "spec.replicas", operator: "=", value: "5" },
      ]),
    ).toBe(false);
  });

  it("no rows matches everything", () => {
    expect(matchesAllFilters(challenge, [])).toBe(true);
  });
});

describe("operator list", () => {
  it("exposes the full ordered operator list", () => {
    expect(filterOperators).toEqual(["=", "!=", "contains", "!contains", "regex", "in", "exists", "!exists"]);
  });
});

describe("createFilterMatcher", () => {
  it("matches identically to matchesAllFilters", () => {
    const rows = [
      { id: "a", field: "spec.state", operator: "=" as const, value: "pending" },
      { id: "b", field: "status.conditions[*].type", operator: "in" as const, value: "Ready, Valid" },
    ];
    const matcher = createFilterMatcher(rows);
    expect(matcher(challenge)).toBe(true);
    expect(matcher({ spec: { state: "ready" } })).toBe(false);
    expect(matcher({})).toBe(false);
  });

  it("reuses compiled regexes across items", () => {
    const matcher = createFilterMatcher([{ id: "a", field: "spec.state", operator: "regex", value: "^pend" }]);
    for (let i = 0; i < 100; i += 1) {
      expect(matcher({ spec: { state: `pending-${i}` } })).toBe(true);
    }
    expect(matcher({ spec: { state: "ready" } })).toBe(false);
  });
});
