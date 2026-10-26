import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { spawnSync } from "node:child_process";
import { parseFilterQuery, serializeFilterQuery } from "./filter-query";
import { createFilterMatcher, getFieldValues, parsePath, type FieldFilter } from "./filter-engine";
import { collectFieldPaths, derivedColumns, fieldPathsOf } from "./field-paths";
import { projectItem, serializeDownload } from "./download-matches";
import { resolveFieldPathPick } from "./field-path-search";
import { buildKubectlYqCommand } from "./kubectl-yq";
import { parseRelativeDurationMs } from "./time-value";

const row = (field: string, operator: FieldFilter["operator"], value = ""): FieldFilter => ({ id: "t", field, operator, value, combinator: "and" });
const resource = { apiResource: "widgets", apiVersionWithGroup: "example.com/v1", kind: "Widget", isNamespaced: true };
afterEach(() => vi.restoreAllMocks());

describe("resource version selection", () => {
  it("requests the selected API version rather than the server preferred version", () => {
    expect(buildKubectlYqCommand({ ...resource, apiVersionWithGroup: "example.com/v1beta1" }, [])).toContain("widgets.v1beta1.example.com");
    expect(buildKubectlYqCommand({ ...resource, apiVersionWithGroup: "v1", apiResource: "pods" }, [])).toContain("kubectl get pods ");
  });
});

describe("query integrity", () => {
  it("round-trips existence, quoted connectors, backslashes, quotes, and quoted map keys", () => {
    const rows = [row("spec.state", "exists"), { ...row('metadata.labels["a AND b"]', "=", 'say "yes" AND C:\\temp\\file OR no'), combinator: "or" as const }, row("spec.absent", "!exists")];
    expect(parseFilterQuery(serializeFilterQuery(rows))).toEqual(rows.map(({ id: _id, ...r }) => r));
    expect(parseFilterQuery("")).toEqual([]);
    for (const value of ["AND", "or", "can't", "C:\\temp", "\\d+"]) {
      expect(parseFilterQuery(serializeFilterQuery([row("spec.state", "=", value)]))[0].value).toBe(value);
    }
  });
  it.each(['spec.state = ready AND broken', 'spec.state = "unfinished', 'spec.state = ready OR', 'spec.state exists yes', 'spec.state ='])('rejects the whole malformed query: %s', (query) => {
    expect(() => parseFilterQuery(query)).toThrow();
  });
});

describe("paths and sampled suggestions", () => {
  const item = { metadata: { labels: { "app.kubernetes.io/name": "worker", 'a ] " key': "quoted" } }, spec: { nested: { state: "ready" }, replicas: 2 } };
  it("offers and resolves literal map keys, including embedded brackets and quotes", () => {
    for (const [key, value] of Object.entries(item.metadata.labels)) {
      const path = `metadata.labels[${JSON.stringify(key)}]`;
      expect(fieldPathsOf(collectFieldPaths([item]))).toContain(path);
      expect(getFieldValues(item, path)).toEqual([value]);
      expect(projectItem(item, [path])).toEqual({ [path]: value });
      expect(resolveFieldPathPick([], path)).toBe(path);
    }
    expect(getFieldValues({ "a.b": [{ x: 1 }] }, '["a.b"][0].x')).toEqual([1]);
  });
  it.each(['spec.foo[bad]', 'spec.foo.', 'spec..foo', 'spec["unterminated]'])('fails closed for malformed paths: %s', (path) => {
    expect(parsePath(path)).toEqual([]);
    expect(getFieldValues(item, path)).toEqual([]);
  });
  it("does not treat unsampled fields as disabled filters", () => {
    const items = [...Array.from({ length: 200 }, () => ({ spec: {} })), { spec: { rare: "yes" } }];
    expect(fieldPathsOf(collectFieldPaths(items))).not.toContain("spec.rare");
    expect(items.filter(createFilterMatcher([row("spec.rare", "=", "yes")]))).toEqual([items[200]]);
  });
  it("derives scalar columns instead of object containers", () => {
    expect(derivedColumns(collectFieldPaths([item])).map((column) => column.path)).toEqual(["spec.replicas", "spec.nested.state"]);
  });
});

describe("download formats", () => {
  it.each(["yq", "jq"] as const)("round-trips full resources and empty lists in %s", (dialect) => {
    const data = [{ metadata: { name: "001", labels: { "a.b/c": "true" } }, spec: { enabled: false, replicas: 0, nil: null, text: "first\nsecond", items: ["null", "2026-01-01", "yes", "on", "NO"] } }];
    for (const payload of [data, []]) {
      const file = serializeDownload(payload, dialect);
      expect(file.extension).toBe(dialect === "yq" ? "yaml" : "json");
      expect(file.mimeType).toBe(dialect === "yq" ? "application/yaml" : "application/json");
      expect(dialect === "yq" ? parse(file.content) : JSON.parse(file.content)).toEqual(payload);
      if (dialect === "yq") expect(parse(file.content, { version: "1.1" })).toEqual(payload);
    }
  });
  it("preserves a projected own __proto__ key", () => {
    const item = JSON.parse('{"__proto__":{"state":"ready"}}');
    const projected = projectItem(item, ["__proto__"]);
    expect(Object.hasOwn(projected, "__proto__")).toBe(true);
    expect(JSON.parse(serializeDownload([projected], "jq").content)).toEqual([item]);
  });
  it("uses the resource JSON representation in both formats", () => {
    const item = { internal: "hidden", toJSON: () => ({ metadata: { name: "a" } }) };
    expect(parse(serializeDownload([item], "yq").content)).toEqual(JSON.parse(serializeDownload([item], "jq").content));
    expect(projectItem({}, ["spec.missing"])).toEqual({ "spec.missing": null });
  });
});

for (const dialect of ["yq", "jq"] as const) {
  const version = spawnSync(dialect, ["--version"], { encoding: "utf8" });
  const available = version.status === 0 && (dialect === "jq" || version.stdout.includes("mikefarah"));
  describe.skipIf(!available)(`${dialect} audit command parity`, () => {
    const check = (items: object[], filters: FieldFilter[]) => {
      const command = buildKubectlYqCommand(resource, filters, "all", ["metadata.name"], dialect);
      const program = command.split(` | ${dialect} `)[1].slice(1, -1).replace(/'\\''/g, "'");
      const result = spawnSync(dialect, dialect === "jq" ? ["-r", program] : ["-r", program], { input: JSON.stringify({ items }), encoding: "utf8" });
      expect(result.status, result.stderr + "\n" + program).toBe(0);
      const expected = items.filter(createFilterMatcher(filters)).map((item) => (item as { metadata: { name: string } }).metadata.name);
      expect(result.stdout.trim() ? result.stdout.trim().split("\n") : [], command).toEqual(expected);
    };
    it("matches literal strings, numbers, booleans and missing/null fields", () => {
      const values = [{ a: "x", b: true }, ["a", "b"], "a*b", "axxb", "A*B", "a.b$[x]", "01", 1, 0, "true", true, false, null, undefined, ""];
      const items = values.map((value, i) => ({ metadata: { name: `item-${i}` }, spec: { value } }));
      for (const operator of ["=", "!=", "contains", "!contains", "in", "exists", "!exists", "regex"] as const) {
        for (const value of ['{"a":"x","b":true}', '["a","b"]', "a*b", "a.b$[x]", "01", " true ", "ready", "null", "["]) {
          check(items, [row("spec.value", operator, value)]);
        }
      }
    });
    it("uses the same regex input limit for long and non-BMP values", () => {
      const items = [
        { metadata: { name: "long" }, spec: { value: "x".repeat(10_000) + "tail" } },
        { metadata: { name: "unicode" }, spec: { value: "😀".repeat(6_000) + "tail" } },
      ];
      check(items, [row("spec.value", "regex", "tail$")]);
      check(items, [row("spec.value", "regex", "^x+$")]);
    });
    it("keeps one projected object per resource when several wildcard fields fan out", () => {
      const items = [
        { metadata: { name: "a" }, spec: { x: [1, 2], y: ["a", "b"] } },
        { metadata: { name: "b" }, spec: { x: [], y: [] } },
        { metadata: { name: "c" }, spec: { x: [false], y: [null] } },
      ];
      const fields = ["metadata.name", "spec.x[*]", "spec.y[*]"];
      const command = buildKubectlYqCommand(resource, [], "all", fields, dialect);
      const program = command.split(` | ${dialect} `)[1].slice(1, -1);
      const result = spawnSync(dialect, dialect === "jq" ? ["-c", program] : ["-o=json", "-I=0", program], { input: JSON.stringify({ items }), encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim().split("\n").map((line) => JSON.parse(line))).toEqual(items.map((item) => projectItem(item, fields)));
    });
    it("matches literal glob-looking map keys rather than neighboring keys", () => {
      const items = [
        { metadata: { name: "literal" }, spec: { "a*": { value: "yes" }, "a?": { value: "yes" } } },
        { metadata: { name: "neighbor" }, spec: { abc: { value: "yes" }, ab: { value: "yes" } } },
        { metadata: { name: "array" }, spec: [] },
      ];
      for (const path of ['spec["a*"].value', 'spec["a?"].value']) {
        check(items, [row(path, "=", "yes")]);
        check(items, [row(path, "!exists")]);
      }
    });
    it("exports quoted paths with dots, brackets, quotes and root keys", () => {
      const items = [{ metadata: { name: "a" }, "a.b": { 'bracket]"key': "match" } }, { metadata: { name: "b" }, "a.b": {} }];
      check(items, [row('["a.b"]["bracket]\\"key"]', "=", "match")]);
    });
    it("compares actual instants with offsets, fractions, equality, missing and invalid timestamps", () => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-26T12:00:00.500Z"));
      const timestamps = ["2026-10-25T12:00:00.500Z", "2026-10-25T15:30:00.500+03:30", "2026-10-25T08:00:00.500-04:00", "2026-10-25T12:00:00.499Z", "2026-10-25T12:00:00.501Z", "2026-10-25T12:00:00.5009Z", "2026-10-25T12:00:00+24:00", "2026-10-25T12:00:00+00:60", "2026-02-31T12:00:00Z", "2026-10-25", "not-a-date", "2026-99-99T12:00:00Z", ": unsafe yaml", null, undefined];
      const items = timestamps.map((value, i) => ({ metadata: { name: `item-${i}`, creationTimestamp: value } }));
      check(items, [row("metadata.creationTimestamp", "older_than", "1d")]);
      check(items, [row("metadata.creationTimestamp", "newer_than", "1d")]);
      check(items, [row("metadata.creationTimestamp", "newer_than", "99999999d")]);
    });
    it("does not crash on huge durations and preserves inactive OR semantics", () => {
      const value = "999999999999999999d";
      expect(parseRelativeDurationMs(value)).toBeNull();
      const items = [{ metadata: { name: "a" } }];
      check(items, [row("metadata.creationTimestamp", "older_than", value)]);
      check(items, [row("spec.state", "=", "ready"), { ...row("metadata.creationTimestamp", "older_than", value), combinator: "or" }]);
    });
  });
}
