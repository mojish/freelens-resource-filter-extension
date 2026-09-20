/**
 * Translate active UI filters into kubectl + yq/jq one-liners.
 *
 * Default dialect: mikefarah/yq v4. Optional `jq` dialect for jq / kislyuk yq.
 */

import { groupFiltersByCombinator, parsePath, type FieldFilter } from "./filter-engine";
import { parseRelativeDurationMs } from "./time-value";

export interface KubectlResourceRef {
  apiResource: string;
  apiVersionWithGroup: string;
  kind: string;
  isNamespaced: boolean;
}

export type SelectedNamespaces = "all" | string[];
export type KubectlDialect = "yq" | "jq";
export type KubectlExportMode = "objects";

export function fieldPathToYq(path: string): string {
  let expr = "";
  for (const segment of parsePath(path)) {
    if (segment.kind === "any-index") {
      expr += "[]";
    } else if (segment.kind === "index") {
      expr += `[${segment.index}]`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.name)) {
      expr += `.${segment.name}`;
    } else {
      expr += `[${JSON.stringify(segment.name)}]`;
    }
  }
  return expr || ".";
}

/** jq-safe optional iterators for maps/arrays. */
export function fieldPathToJq(path: string): string {
  let expr = "";
  for (const segment of parsePath(path)) {
    if (segment.kind === "any-index") {
      expr += "[]?";
    } else if (segment.kind === "index") {
      expr += `[${segment.index}]?`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.name)) {
      expr += `.${segment.name}`;
    } else {
      expr += `[${JSON.stringify(segment.name)}]`;
    }
  }
  return expr || ".";
}

function yqString(value: string): string {
  return JSON.stringify(value);
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function kubectlResourceArg(resource: KubectlResourceRef): string {
  const resourceName =
    resource.apiResource || `${resource.kind.charAt(0).toLowerCase()}${resource.kind.slice(1)}s`;
  const gv = resource.apiVersionWithGroup;
  if (!gv || gv === "v1") {
    return resourceName;
  }
  const slash = gv.indexOf("/");
  const group = slash === -1 ? "" : gv.slice(0, slash);
  if (!group) {
    return resourceName;
  }
  return `${resourceName}.${group}`;
}

function namespaceFlag(resource: KubectlResourceRef, namespaces: SelectedNamespaces): string {
  if (!resource.isNamespaced) {
    return "";
  }
  if (namespaces === "all" || namespaces.length === 0) {
    return " -A";
  }
  if (namespaces.length === 1) {
    return ` -n ${shellSingleQuote(namespaces[0])}`;
  }
  return " -A";
}

function namespacePredicate(
  resource: KubectlResourceRef,
  namespaces: SelectedNamespaces,
  dialect: KubectlDialect,
): string | null {
  if (!resource.isNamespaced || namespaces === "all" || namespaces.length <= 1) {
    return null;
  }
  const clauses = namespaces.map((name) => `.metadata.namespace == ${yqString(name)}`);
  return dialect === "yq" ? `(${clauses.join(" or ")})` : `(${clauses.join(" or ")})`;
}

function timeCutoffIso(value: string): string | null {
  const ms = parseRelativeDurationMs(value);
  if (ms == null) {
    return null;
  }
  return new Date(Date.now() - ms).toISOString();
}

export function filterToYqPredicate(filter: FieldFilter): string | null {
  if (filter.field === "") {
    return null;
  }
  if (
    filter.operator !== "exists" &&
    filter.operator !== "!exists" &&
    filter.value === ""
  ) {
    return null;
  }

  const path = fieldPathToYq(filter.field);
  const lowered = `(${path} | to_string | downcase)`;
  const needle = yqString(filter.value.toLowerCase());

  switch (filter.operator) {
    case "=":
      return `${lowered} == ${needle}`;
    case "!=":
      return `${lowered} != ${needle}`;
    case "contains":
      return `${lowered} | contains(${needle})`;
    case "!contains":
      return `(${lowered} | contains(${needle})) | not`;
    case "regex":
      return `(${path} | to_string | test(${yqString(filter.value)}))`;
    case "in": {
      const parts = filter.value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0)
        .map((part) => `. == ${yqString(part)}`);
      if (parts.length === 0) {
        return null;
      }
      return `${lowered} | (${parts.join(" or ")})`;
    }
    case "exists":
      return `${path} != null`;
    case "!exists":
      return `${path} == null`;
    case "older_than": {
      const cutoff = timeCutoffIso(filter.value);
      return cutoff ? `(${path} | to_string) < ${yqString(cutoff)}` : null;
    }
    case "newer_than": {
      const cutoff = timeCutoffIso(filter.value);
      return cutoff ? `(${path} | to_string) >= ${yqString(cutoff)}` : null;
    }
    default:
      return null;
  }
}

export function filterToJqPredicate(filter: FieldFilter): string | null {
  if (filter.field === "") {
    return null;
  }
  if (
    filter.operator !== "exists" &&
    filter.operator !== "!exists" &&
    filter.value === ""
  ) {
    return null;
  }

  const path = fieldPathToJq(filter.field);
  const generator = `(try ${path} catch empty)`;
  const lowered = "(. | tostring | ascii_downcase)";
  const needle = yqString(filter.value.toLowerCase());

  switch (filter.operator) {
    case "=":
      return `any(${generator}; ${lowered} == ${needle})`;
    case "!=":
      return `any(${generator}; ${lowered} != ${needle})`;
    case "contains":
      return `any(${generator}; ${lowered} | contains(${needle}))`;
    case "!contains":
      return `any(${generator}; (${lowered} | contains(${needle})) | not)`;
    case "regex":
      return `any(${generator}; (. | tostring) | test(${yqString(filter.value)}))`;
    case "in": {
      const parts = filter.value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0)
        .map(yqString);
      if (parts.length === 0) {
        return null;
      }
      return `any(${generator}; ${lowered} | IN(${parts.join(", ")}))`;
    }
    case "exists":
      return `any(${generator}; . != null and (. | tostring) != "")`;
    case "!exists":
      return `(any(${generator}; . != null and (. | tostring) != "") | not)`;
    case "older_than": {
      const cutoff = timeCutoffIso(filter.value);
      return cutoff ? `any(${generator}; (. | tostring) < ${yqString(cutoff)})` : null;
    }
    case "newer_than": {
      const cutoff = timeCutoffIso(filter.value);
      return cutoff ? `any(${generator}; (. | tostring) >= ${yqString(cutoff)})` : null;
    }
    default:
      return null;
  }
}

export function projectionToYq(paths: string[]): string | null {
  const unique = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
  if (unique.length === 0) {
    return null;
  }
  if (unique.length === 1) {
    return fieldPathToYq(unique[0]);
  }
  const entries = unique.map((path) => `${yqString(path)}: ${fieldPathToYq(path)}`);
  return `{${entries.join(", ")}}`;
}

function projectionToJq(paths: string[]): string | null {
  const unique = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
  if (unique.length === 0) {
    return null;
  }
  if (unique.length === 1) {
    return fieldPathToJq(unique[0]);
  }
  const entries = unique.map((path) => `${yqString(path)}: ${fieldPathToJq(path)}`);
  return `{${entries.join(", ")}}`;
}

function groupPredicates(
  filters: FieldFilter[],
  toPredicate: (filter: FieldFilter) => string | null,
): string[] {
  const groups = groupFiltersByCombinator(filters);
  const out: string[] = [];
  for (const group of groups) {
    const parts = group.map(toPredicate).filter((p): p is string => p !== null);
    if (parts.length === 0) {
      continue;
    }
    out.push(parts.length === 1 ? parts[0] : `(${parts.join(" or ")})`);
  }
  return out;
}

export interface BuildKubectlOptions {
  namespaces?: SelectedNamespaces;
  outputFields?: string[];
  dialect?: KubectlDialect;
  mode?: KubectlExportMode;
}

/**
 * Build a copy-pasteable kubectl | yq/jq command.
 *
 * jq cannot parse YAML — kubectl uses `-o json` for the jq dialect.
 */
export function buildKubectlYqCommand(
  resource: KubectlResourceRef,
  filters: FieldFilter[],
  namespaces: SelectedNamespaces = "all",
  outputFields: string[] = [],
  dialect: KubectlDialect = "yq",
  mode: KubectlExportMode = "objects",
): string {
  const resourceArg = kubectlResourceArg(resource);
  const nsFlag = namespaceFlag(resource, namespaces);
  const outputFlag = dialect === "jq" ? "json" : "yaml";
  const kubectl = `kubectl get ${resourceArg}${nsFlag} -o ${outputFlag}`;

  const toPredicate = dialect === "yq" ? filterToYqPredicate : filterToJqPredicate;
  const predicates = [
    ...groupPredicates(filters, toPredicate),
    namespacePredicate(resource, namespaces, dialect),
  ].filter((p): p is string => p !== null);
  const projection = dialect === "yq" ? projectionToYq(outputFields) : projectionToJq(outputFields);

  if (predicates.length === 0 && projection === null && mode === "objects") {
    return kubectl;
  }

  const item = dialect === "yq" ? ".items[]" : ".items[]?";
  let program = item;
  for (const predicate of predicates) {
    program += ` | select(${predicate})`;
  }

  if (mode === "objects" && projection !== null) {
    program += ` | ${projection}`;
  }

  const pipeTool = dialect === "yq" ? "yq" : "jq";
  return `${kubectl} | ${pipeTool} ${shellSingleQuote(program)}`;
}

/** Convenience overload matching older call sites via options object. */
export function buildKubectlCommand(
  resource: KubectlResourceRef,
  filters: FieldFilter[],
  options: BuildKubectlOptions = {},
): string {
  return buildKubectlYqCommand(
    resource,
    filters,
    options.namespaces ?? "all",
    options.outputFields ?? [],
    options.dialect ?? "yq",
    options.mode ?? "objects",
  );
}
