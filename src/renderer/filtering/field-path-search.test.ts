import { describe, expect, it } from "vitest";
import {
  fieldPathFilterOption,
  fieldPathMatchScore,
  looksLikeFieldPath,
  matchesFieldPathQuery,
  rankFieldPathMatches,
  resolveFieldPathPick,
} from "./field-path-search";

const path = "spec.records.@[*].type";

describe("matchesFieldPathQuery", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesFieldPathQuery(path, "")).toBe(true);
    expect(matchesFieldPathQuery(path, "   ")).toBe(true);
  });

  it("matches a plain substring case-insensitively", () => {
    expect(matchesFieldPathQuery(path, "records")).toBe(true);
    expect(matchesFieldPathQuery(path, "TYPE")).toBe(true);
    expect(matchesFieldPathQuery(path, "cname")).toBe(false);
  });

  it("treats whitespace as ordered regex wildcards", () => {
    expect(matchesFieldPathQuery(path, "record type")).toBe(true);
    expect(matchesFieldPathQuery(path, "spec type")).toBe(true);
    expect(matchesFieldPathQuery(path, "records @ type")).toBe(true);
    expect(matchesFieldPathQuery(path, "type record")).toBe(false);
  });

  it("accepts a single-token regex", () => {
    expect(matchesFieldPathQuery(path, "records.*type")).toBe(true);
    expect(matchesFieldPathQuery(path, String.raw`\[\*\]\.type`)).toBe(true);
    expect(matchesFieldPathQuery(path, "^status")).toBe(false);
  });

  it("never throws on invalid regex tokens", () => {
    expect(matchesFieldPathQuery(path, "([unclosed")).toBe(false);
  });
});

describe("rankFieldPathMatches", () => {
  const paths = [
    "spec.records.@[*].type",
    "spec.records.sapi[*].type",
    "spec.records[*][*].type",
    "spec.records",
    "spec.replicas",
    "status.conditions[*].type",
  ];

  it("puts exact and shorter prefix matches first", () => {
    expect(rankFieldPathMatches(paths, "spec.records")[0]).toBe("spec.records");
  });

  it("prefers key-agnostic [*].[*].type for multi-word record type queries", () => {
    const ranked = rankFieldPathMatches(paths, "record type");
    expect(ranked[0]).toBe("spec.records[*][*].type");
    expect(ranked.indexOf("spec.records[*][*].type")).toBeLessThan(ranked.indexOf("spec.records.sapi[*].type"));
    expect(ranked.indexOf("spec.records[*][*].type")).toBeLessThan(ranked.indexOf("spec.records.@[*].type"));
  });
});

describe("fieldPathMatchScore", () => {
  it("scores wildcard fan-out higher than concrete map keys for record type", () => {
    const query = "record type";
    expect(fieldPathMatchScore("spec.records[*][*].type", query)).toBeGreaterThan(
      fieldPathMatchScore("spec.records.sapi[*].type", query),
    );
    expect(fieldPathMatchScore("spec.records[*][*].type", query)).toBeGreaterThan(
      fieldPathMatchScore("spec.records.@[*].type", query),
    );
  });
});

describe("resolveFieldPathPick", () => {
  const paths = ["spec.records", "spec.records.@[*].type", "spec.records[*][*].type"];

  it("prefers an exact match on Enter", () => {
    expect(resolveFieldPathPick(paths, "spec.records")).toBe("spec.records");
  });

  it("accepts a freeform typed path", () => {
    expect(resolveFieldPathPick(paths, "spec.custom.path")).toBe("spec.custom.path");
  });

  it("falls back to the top ranked match", () => {
    expect(resolveFieldPathPick(paths, "record type")).toBe("spec.records[*][*].type");
  });
});

describe("looksLikeFieldPath", () => {
  it("detects dotted paths", () => {
    expect(looksLikeFieldPath("spec.records")).toBe(true);
    expect(looksLikeFieldPath("records")).toBe(false);
  });
});

describe("fieldPathFilterOption", () => {
  it("reads path from option.value / option.data.value", () => {
    expect(fieldPathFilterOption({ value: path, label: path }, "record type")).toBe(true);
    expect(fieldPathFilterOption({ data: { value: path, label: path } }, "record type")).toBe(true);
    expect(fieldPathFilterOption({ value: "metadata.name" }, "record type")).toBe(false);
  });
});
