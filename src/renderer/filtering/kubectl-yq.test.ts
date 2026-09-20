import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import type { FieldFilter } from "./filter-engine";
import { buildKubectlYqCommand, fieldPathToYq, filterToYqPredicate, projectionToYq } from "./kubectl-yq";

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

function yqFilter(program: string): string | null {
  const check = spawnSync("yq", ["--version"], { encoding: "utf8" });
  if (check.status !== 0 || !check.stdout.includes("mikefarah")) {
    return null;
  }
  const quoted = program.replace(/^'|'$/g, "");
  const result = spawnSync("yq", [quoted], { input: listYaml, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`yq failed (${result.status}): ${result.stderr}\nprogram: ${quoted}`);
  }
  return result.stdout.trim();
}

describe("fieldPathToYq", () => {
  it("maps plain and array paths", () => {
    expect(fieldPathToYq("metadata.namespace")).toBe(".metadata.namespace");
    expect(fieldPathToYq("status.conditions[*].type")).toBe(".status.conditions[].type");
    expect(fieldPathToYq("status.conditions[0].type")).toBe(".status.conditions[0].type");
  });

  it("quotes special map keys and fans out maps", () => {
    expect(fieldPathToYq("spec.entries.@[*].type")).toBe('.spec.entries["@"][].type');
    expect(fieldPathToYq("spec.entries[*][*].type")).toBe(".spec.entries[][].type");
  });
});

describe("filterToYqPredicate", () => {
  it("skips disabled rows", () => {
    expect(filterToYqPredicate(filter("", "=", "x"))).toBeNull();
    expect(filterToYqPredicate(filter("spec.state", "=", ""))).toBeNull();
  });

  it("builds a downcased equality select predicate", () => {
    expect(filterToYqPredicate(filter("spec.entries[*][*].type", "=", "AAAA"))).toBe(
      '(.spec.entries[][].type | to_string | downcase) == "aaaa"',
    );
  });
});

describe("buildKubectlYqCommand", () => {
  it("emits kubectl only when there are no active filters", () => {
    expect(buildKubectlYqCommand(widget, [])).toBe("kubectl get widgets.example.com -A -o yaml");
  });

  it("uses -n for a single selected namespace", () => {
    expect(buildKubectlYqCommand(widget, [], ["ns-a"])).toBe(
      "kubectl get widgets.example.com -n 'ns-a' -o yaml",
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
      `kubectl get widgets.example.com -A -o yaml | yq '.items[] | select((.spec.entries[][].type | to_string | downcase) == "aaaa")'`,
    );
  });

  it("combines -n with filters", () => {
    const cmd = buildKubectlYqCommand(
      widget,
      [filter("spec.entries[*][*].type", "=", "AAAA")],
      ["ns-a"],
    );
    expect(cmd).toBe(
      `kubectl get widgets.example.com -n 'ns-a' -o yaml | yq '.items[] | select((.spec.entries[][].type | to_string | downcase) == "aaaa")'`,
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
    expect(projectionToYq(["status"])).toBe(".status");
    expect(projectionToYq(["spec.entries", "status"])).toBe(
      '{"spec.entries": .spec.entries, "status": .status}',
    );
  });

  it("appends projection to the command", () => {
    const cmd = buildKubectlYqCommand(widget, [], "all", ["spec.entries", "status"]);
    expect(cmd).toBe(
      `kubectl get widgets.example.com -A -o yaml | yq '.items[] | {"spec.entries": .spec.entries, "status": .status}'`,
    );
  });
});

describe("mikefarah yq integration", () => {
  it("matches items that have an AAAA entry", () => {
    const cmd = buildKubectlYqCommand(widget, [filter("spec.entries[*][*].type", "=", "AAAA")]);
    const program = cmd.split(" | yq ")[1];
    if (!program) {
      throw new Error("missing yq program");
    }
    const output = yqFilter(program);
    if (output === null) {
      return; // mikefarah yq not installed
    }
    expect(output).toContain("alpha");
    expect(output).not.toContain("beta");
  });
});
