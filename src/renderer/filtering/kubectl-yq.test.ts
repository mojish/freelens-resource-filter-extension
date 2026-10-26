import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createFilterMatcher, type FieldFilter } from "./filter-engine";
import { buildKubectlYqCommand, fieldPathToJq, fieldPathToYq, filterToYqPredicate, projectionToYq } from "./kubectl-yq";

const filter = (field: string, operator: FieldFilter["operator"], value: string): FieldFilter => ({
  id: "t",
  field,
  operator,
  value,
});

const widget = {
  apiResource: "widgets",
  apiVersionWithGroup: "example.com/v1",
  kind: "Widget",
  isNamespaced: true,
};

const listYaml = `apiVersion: v1
kind: List
items:
- metadata:
    name: alpha
    namespace: ns-a
  spec:
    entries:
      "@":
        - type: A
      other:
        - type: AAAA
- metadata:
    name: beta
    namespace: ns-b
  spec:
    entries:
      www:
        - type: CNAME
- metadata:
    name: empty
    namespace: ns-a
  spec: {}
`;

const yqVersion = spawnSync("yq", ["--version"], { encoding: "utf8" });
const hasYq = yqVersion.status === 0 && yqVersion.stdout.includes("mikefarah");
const hasJq = spawnSync("jq", ["--version"], { encoding: "utf8" }).status === 0;

function yqFilter(program: string, input = listYaml): string {
  const quoted = program.replace(/^'|'$/g, "");
  const result = spawnSync("yq", [quoted], { input, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`yq failed (${result.status}): ${result.stderr}\nprogram: ${quoted}`);
  }
  return result.stdout.trim();
}

describe.each([fieldPathToYq, fieldPathToJq])("%s", (fieldPath) => {
  it("maps plain and array paths", () => {
    expect(fieldPath("metadata.namespace")).toBe(".metadata?.namespace?");
    expect(fieldPath("status.conditions[*].type")).toBe(".status?.conditions?[]?.type?");
    expect(fieldPath("status.conditions[0].type")).toBe(".status?.conditions?[0]?.type?");
  });

  it("quotes special map keys and fans out maps", () => {
    expect(fieldPath("spec.entries.@[*].type")).toBe('.spec?.entries?["@"]?[]?.type?');
    expect(fieldPath("spec.entries[*][*].type")).toBe(".spec?.entries?[]?[]?.type?");
  });
});

describe("filterToYqPredicate", () => {
  it("skips disabled rows", () => {
    expect(filterToYqPredicate(filter("", "=", "x"))).toBeNull();
    expect(filterToYqPredicate(filter("spec.state", "=", ""))).toBeNull();
  });

  it("builds a downcased equality select predicate", () => {
    expect(filterToYqPredicate(filter("spec.entries[*][*].type", "=", "AAAA"))).toBe(
      '([.spec?.entries?[]?[]?.type? | select(. != null) | (((((select(tag == "!!str" or tag == "!!timestamp") | to_string), (select(tag != "!!str" and tag != "!!timestamp") | to_json(0))) | downcase | test("^aaaa$"))))] | any)',
    );
  });
});

describe("buildKubectlYqCommand", () => {
  it("emits kubectl only when there are no active filters", () => {
    expect(buildKubectlYqCommand(widget, [])).toBe("kubectl get widgets.v1.example.com -A -o yaml");
  });

  it("uses -n for a single selected namespace", () => {
    expect(buildKubectlYqCommand(widget, [], ["ns-a"])).toBe(
      "kubectl get widgets.v1.example.com -n 'ns-a' -o yaml",
    );
  });

  it("uses -A plus a namespace select when several namespaces are selected", () => {
    const cmd = buildKubectlYqCommand(widget, [], ["a", "b"]);
    expect(cmd).toContain(" -A -o yaml | yq ");
    expect(cmd).toContain('.metadata.namespace == "a"');
  });

  it("builds a mikefarah select for equality filters", () => {
    const cmd = buildKubectlYqCommand(widget, [filter("spec.entries[*][*].type", "=", "AAAA")]);
    expect(cmd).toBe(
      `kubectl get widgets.v1.example.com -A -o yaml | yq '.items[] | select(([.spec?.entries?[]?[]?.type? | select(. != null) | (((((select(tag == "!!str" or tag == "!!timestamp") | to_string), (select(tag != "!!str" and tag != "!!timestamp") | to_json(0))) | downcase | test("^aaaa$"))))] | any))'`,
    );
  });

  it("combines -n with filters", () => {
    const cmd = buildKubectlYqCommand(
      widget,
      [filter("spec.entries[*][*].type", "=", "AAAA")],
      ["ns-a"],
    );
    expect(cmd).toBe(
      `kubectl get widgets.v1.example.com -n 'ns-a' -o yaml | yq '.items[] | select(([.spec?.entries?[]?[]?.type? | select(. != null) | (((((select(tag == "!!str" or tag == "!!timestamp") | to_string), (select(tag != "!!str" and tag != "!!timestamp") | to_json(0))) | downcase | test("^aaaa$"))))] | any))'`,
    );
  });

  it("uses -o json for jq dialect", () => {
    const cmd = buildKubectlYqCommand(widget, [filter("spec.state", "=", "x")], "all", [], "jq");
    expect(cmd).toContain("-o json | jq ");
    expect(cmd).not.toContain("-o yaml | jq");
  });
});

describe("projectionToYq", () => {
  it("returns null for an empty selection", () => {
    expect(projectionToYq([])).toBeNull();
    expect(projectionToYq(["", "  "])).toBeNull();
  });

  it("maps one and many paths", () => {
    expect(projectionToYq(["status"])).toBe(".status?");
    expect(projectionToYq(["spec.entries", "status"])).toBe(
      '{"spec.entries": ([.spec?.entries?] | ((select(length <= 1) | .[0]), select(length > 1))), "status": ([.status?] | ((select(length <= 1) | .[0]), select(length > 1)))}',
    );
  });

  it("appends projection to the command", () => {
    const cmd = buildKubectlYqCommand(widget, [], "all", ["spec.entries", "status"]);
    expect(cmd).toBe(
      `kubectl get widgets.v1.example.com -A -o yaml | yq '.items[] | {"spec.entries": ([.spec?.entries?] | ((select(length <= 1) | .[0]), select(length > 1))), "status": ([.status?] | ((select(length <= 1) | .[0]), select(length > 1)))}'`,
    );
  });
});

describe.skipIf(!hasYq)("mikefarah yq integration", () => {
  it("matches items that have an AAAA entry", () => {
    const cmd = buildKubectlYqCommand(widget, [filter("spec.entries[*][*].type", "=", "AAAA")]);
    const program = cmd.split(" | yq ")[1];
    if (!program) {
      throw new Error("missing yq program");
    }
    const output = yqFilter(program);
    expect(output).toContain("alpha");
    expect(output).not.toContain("beta");
  });

  const items = [
    { metadata: { name: "ready" }, spec: { state: "Ready", entries: [{ state: "Ready" }, {}] } },
    { metadata: { name: "pending" }, spec: { state: "pending", entries: [{ state: "pending" }] } },
    { metadata: { name: "blank" }, spec: { state: "", entries: [{ state: "" }] } },
    { metadata: { name: "null" }, spec: { state: null, entries: null } },
    { metadata: { name: "empty" }, spec: { entries: [] } },
    { metadata: { name: "missing" }, spec: {} },
  ];

  it.each(["spec.state", "spec.entries[*].state"])("matches UI semantics for %s", (field) => {
    const cases: [FieldFilter["operator"], string][] = [
      ["=", "ready"], ["!=", "ready"], ["contains", "end"], ["!contains", "end"],
      ["regex", "^Ready$"], ["in", "ready, pending"], ["exists", ""], ["!exists", ""],
    ];
    for (const [operator, value] of cases) {
      const filters = [filter(field, operator, value)];
      const cmd = buildKubectlYqCommand(widget, filters, "all", ["metadata.name"]);
      const output = yqFilter(cmd.split(" | yq ")[1], JSON.stringify({ items }));
      const expected = items.filter(createFilterMatcher(filters)).map((item) => item.metadata.name);
      expect(output ? output.split("\n") : [], `${field} ${operator}`).toEqual(expected);
    }
  });

  it("keeps each OR branch in the resource context", () => {
    const filters = [
      filter("spec.state", "contains", "end"),
      { ...filter("metadata.name", "=", "ready"), combinator: "or" as const },
    ];
    const cmd = buildKubectlYqCommand(widget, filters, "all", ["metadata.name"]);
    expect(yqFilter(cmd.split(" | yq ")[1], JSON.stringify({ items }))).toBe("ready\npending");
  });
});

describe.each(["yq", "jq"] as const)("%s heterogeneous path integration", (dialect) => {
  it.skipIf(dialect === "yq" ? !hasYq : !hasJq)("skips incompatible branches without losing later matches", () => {
    const items = [
      { metadata: { name: "absent" }, spec: { groups: { array: [{}], scalar: "text", nil: null } } },
      // An array before a valid object used to crash yq and abort jq's whole traversal.
      { metadata: { name: "enabled" }, spec: { groups: { array: [{}], valid: { routing: { enabled: true } } } } },
      { metadata: { name: "disabled" }, spec: { groups: { array: [{}], valid: { routing: { enabled: false } } } } },
      { metadata: { name: "empty" }, spec: {} },
    ];
    for (const operator of ["exists", "!exists", "="] as const) {
      const filters = [filter("spec[*][*].routing.enabled", operator, "false")];
      const cmd = buildKubectlYqCommand(widget, filters, "all", ["metadata.name"], dialect);
      const program = cmd.split(` | ${dialect} `)[1].slice(1, -1);
      const result = spawnSync(dialect, ["-r", program], { input: JSON.stringify({ items }), encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const expected = items.filter(createFilterMatcher(filters)).map((item) => item.metadata.name);
      expect(result.stdout.trim() ? result.stdout.trim().split("\n") : [], operator).toEqual(expected);
    }
  });

  it.skipIf(dialect === "yq" ? !hasYq : !hasJq)("combines age, nested equality, and wildcard absence filters", () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const item = (name: string, timestamp: string, address: string, present: boolean) => ({
      metadata: { name, creationTimestamp: timestamp },
      spec: {
        targets: [{ nodes: [{ address }] }],
        groups: { array: [{}], valid: present ? { routing: { enabled: false } } : {} },
      },
    });
    const items = [
      item("match", recent, "192.0.2.1", false),
      item("has-field", recent, "192.0.2.1", true),
      item("old", "2000-01-01T00:00:00Z", "192.0.2.1", false),
      item("other-address", recent, "192.0.2.2", false),
    ];
    const filters = [
      filter("metadata.creationTimestamp", "newer_than", "70d"),
      filter("spec.targets[*].nodes[*].address", "=", "192.0.2.1"),
      filter("spec[*][*].routing.enabled", "!exists", ""),
    ];
    const cmd = buildKubectlYqCommand(widget, filters, ["ns-a"], ["metadata.name"], dialect);
    const program = cmd.split(` | ${dialect} `)[1].slice(1, -1);
    const result = spawnSync(dialect, ["-r", program], { input: JSON.stringify({ items }), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("match");
    expect(items.filter(createFilterMatcher(filters)).map((entry) => entry.metadata.name)).toEqual(["match"]);
  });

  it.skipIf(dialect === "yq" ? !hasYq : !hasJq)("projects special keys and array indexes after incompatible siblings", () => {
    const items = [{
      metadata: { name: "mixed" },
      spec: { groups: { array: [{}], valid: { "routing-mode": [{ enabled: false }] } } },
    }];
    const field = "spec.groups[*].routing-mode[0].enabled";
    const cmd = buildKubectlYqCommand(widget, [], "all", ["metadata.name", field], dialect);
    const program = cmd.split(` | ${dialect} `)[1].slice(1, -1);
    const args = dialect === "yq" ? ["-o=json", program] : [program];
    const result = spawnSync(dialect, args, { input: JSON.stringify({ items }), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ "metadata.name": "mixed", [field]: false });
  });
});
