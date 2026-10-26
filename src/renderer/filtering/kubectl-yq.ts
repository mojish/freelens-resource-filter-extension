/**
 * Translate active UI filters into kubectl + yq/jq one-liners.
 *
 * Default dialect: mikefarah/yq v4. Optional `jq` dialect for jq / kislyuk yq.
 */

import { groupFiltersByCombinator, parsePath, MAX_REGEX_TEST_LENGTH, type FieldFilter } from "./filter-engine";
import { parseRelativeDurationMs, RFC3339_PATTERN } from "./time-value";

export interface KubectlResourceRef {
  apiResource: string;
  apiVersionWithGroup: string;
  kind: string;
  isNamespaced: boolean;
}

export type SelectedNamespaces = "all" | string[];
export type KubectlDialect = "yq" | "jq";
export type KubectlExportMode = "objects";

/** Optional traversal skips incompatible branches of heterogeneous maps/arrays. */
export function fieldPathToYq(path: string): string {
  let expr = "";
  for (const segment of parsePath(path)) {
    if (segment.kind === "any-index") {
      expr += "[]?";
    } else if (segment.kind === "index") {
      expr += `[${segment.index}]?`;
    } else if (/[?*]/.test(segment.name)) {
      // yq treats even quoted keys as globs; select the literal key explicitly.
      expr = `(${expr || "."} | select(tag == "!!map") | to_entries | .[] | select(.key | ${literalYqEquals(segment.name)}) | .value)`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.name)) {
      expr += `.${segment.name}?`;
    } else {
      expr += `[${JSON.stringify(segment.name)}]?`;
    }
  }
  return expr ? (expr.startsWith("[") ? `.${expr}` : expr) : path.trim() ? "null" : ".";
}

/** Guard each jq segment so one incompatible branch cannot abort its siblings. */
export function fieldPathToJq(path: string): string {
  let expr = "";
  for (const segment of parsePath(path)) {
    if (segment.kind === "any-index") {
      expr += "[]?";
    } else if (segment.kind === "index") {
      expr += `[${segment.index}]?`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.name)) {
      expr += `.${segment.name}?`;
    } else {
      expr += `[${JSON.stringify(segment.name)}]?`;
    }
  }
  return expr ? (expr.startsWith("[") ? `.${expr}` : expr) : path.trim() ? "null" : ".";
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
  const version = gv.slice(slash + 1);
  return `${resourceName}.${version}.${group}`;
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

function timeCutoffMs(value: string, now: number): number | null {
  const ms = parseRelativeDurationMs(value);
  return ms == null ? null : now - ms;
}

function literalYqEquals(value: string): string {
  // yq == treats * as a glob. An escaped, anchored regex is literal equality.
  return `test(${yqString(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)})`;
}

// Match the engine's JSON string form for containers, keeping strings unquoted.
const yqText = '((select(tag == "!!str" or tag == "!!timestamp") | to_string), (select(tag != "!!str" and tag != "!!timestamp") | to_json(0)))';

function validRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true; } catch { return false; }
}

function equalityPredicate(value: string, dialect: KubectlDialect): string {
  const yq = dialect === "yq";
  const lowered = yq ? `${yqText} | downcase` : "tostring | ascii_downcase";
  const literal = yq ? literalYqEquals(value.toLowerCase()) : `. == ${yqString(value.toLowerCase())}`;
  const alternatives = [`(${lowered} | ${literal})`];
  const num = Number(value);
  if (value.trim() !== "" && Number.isFinite(num)) {
    const numeric = yq ? '(tag == "!!int" or tag == "!!float")' : '(type == "number")';
    alternatives.push(`(${numeric} and . == ${num})`);
  }
  const boolean = value.trim().toLowerCase();
  if (boolean === "true" || boolean === "false") {
    alternatives.push(`(${yq ? 'tag == "!!bool"' : 'type == "boolean"'} and . == ${boolean})`);
  }
  return `(${alternatives.join(" or ")})`;
}

// Kubernetes timestamps use RFC3339. The guard makes from_yaml safe for arbitrary
// strings; its timestamp tag also rejects invalid calendar dates before comparison.
const yqTimestamp = `to_string | select(test(${yqString(RFC3339_PATTERN)})) | from_yaml | select(tag == "!!timestamp") | . as $t | ($t | to_unix) as $s | ($t | format_datetime(".000") | to_string | tonumber) as $f | (($s * 1000) + ($f * 1000))`;
// jq's fromdateiso8601 accepts UTC seconds only. Parse the offset and fraction
// explicitly, keeping milliseconds like JavaScript Date and skipping bad inputs.
const jqTimestamp = `try (tostring | capture("^(?<date>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?<fraction>\\\\.[0-9]+)?(?<zone>Z|(?<sign>[+-])(?<hours>[0-9]{2}):(?<minutes>[0-9]{2}))$") | . as $t | ($t.date + "Z" | fromdateiso8601) as $seconds | select(($seconds | strftime("%Y-%m-%dT%H:%M:%S")) == $t.date) | (if $t.zone == "Z" then 0 else (($t.hours | tonumber) * 60 + ($t.minutes | tonumber)) * 60 * (if $t.sign == "+" then 1 else -1 end) end) as $offset | select($t.zone == "Z" or (($t.hours | tonumber) < 24 and ($t.minutes | tonumber) < 60)) | (($seconds - $offset) * 1000 + ((($t.fraction // ".") + "000" | .[1:4]) | tonumber))) catch empty`;

export function filterToYqPredicate(filter: FieldFilter, now = Date.now()): string | null {
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
  // A row matches if any non-null value matches. Reduce the whole path before
  // select, especially for !exists on a mix of present and missing entries.
  const anyValue = (predicate: string): string =>
    `([${path} | select(. != null) | (${predicate})] | any)`;
  const lowered = `(${yqText} | downcase)`;
  const needle = yqString(filter.value.toLowerCase());

  switch (filter.operator) {
    case "=":
      return anyValue(equalityPredicate(filter.value, "yq"));
    case "!=":
      return anyValue(`(${equalityPredicate(filter.value, "yq")}) | not`);
    case "contains":
      return anyValue(`${lowered} | contains(${needle})`);
    case "!contains":
      return anyValue(`(${lowered} | contains(${needle})) | not`);
    case "regex":
      return validRegex(filter.value) ? anyValue(`${yqText} | split("") | .[0:${MAX_REGEX_TEST_LENGTH}] | join("") | test(${yqString(filter.value)})`) : "false";
    case "in": {
      const parts = filter.value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0)
        .map((part) => literalYqEquals(part));
      if (parts.length === 0) {
        return null;
      }
      return anyValue(`${lowered} | (${parts.join(" or ")})`);
    }
    case "exists":
      return anyValue('to_string != ""');
    case "!exists":
      return `(${anyValue('to_string != ""')} | not)`;
    case "older_than": {
      const cutoff = timeCutoffMs(filter.value, now);
      return cutoff !== null ? anyValue(`${yqTimestamp} | . <= ${cutoff}`) : null;
    }
    case "newer_than": {
      const cutoff = timeCutoffMs(filter.value, now);
      return cutoff !== null ? anyValue(`${yqTimestamp} | . >= ${cutoff}`) : null;
    }
    default:
      return null;
  }
}

export function filterToJqPredicate(filter: FieldFilter, now = Date.now()): string | null {
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
  const generator = `(try ${path} catch empty) | select(. != null)`;
  const lowered = "(. | tostring | ascii_downcase)";
  const needle = yqString(filter.value.toLowerCase());

  switch (filter.operator) {
    case "=":
      return `any(${generator}; ${equalityPredicate(filter.value, "jq")})`;
    case "!=":
      return `any(${generator}; (${equalityPredicate(filter.value, "jq")}) | not)`;
    case "contains":
      return `any(${generator}; ${lowered} | contains(${needle}))`;
    case "!contains":
      return `any(${generator}; (${lowered} | contains(${needle})) | not)`;
    case "regex":
      return validRegex(filter.value) ? `any(${generator}; (. | tostring | .[0:${MAX_REGEX_TEST_LENGTH}]) | test(${yqString(filter.value)}))` : "false";
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
      const cutoff = timeCutoffMs(filter.value, now);
      return cutoff !== null ? `any(${generator}; (${jqTimestamp}) <= ${cutoff})` : null;
    }
    case "newer_than": {
      const cutoff = timeCutoffMs(filter.value, now);
      return cutoff !== null ? `any(${generator}; (${jqTimestamp}) >= ${cutoff})` : null;
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
  const entries = unique.map((path) => `${yqString(path)}: ([${fieldPathToYq(path)}] | ((select(length <= 1) | .[0]), select(length > 1)))`);
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
  const entries = unique.map((path) => `${yqString(path)}: ([${fieldPathToJq(path)}] | if length <= 1 then .[0] else . end)`);
  return `{${entries.join(", ")}}`;
}

function groupPredicates(
  filters: FieldFilter[],
  toPredicate: (filter: FieldFilter) => string | null,
): string[] {
  const groups = groupFiltersByCombinator(filters);
  const out: string[] = [];
  for (const group of groups) {
    const parts = group.map(toPredicate);
    // A disabled row is true in the UI; OR with it disables the whole group.
    if (!parts.every((part): part is string => part !== null)) {
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
  now = Date.now(),
): string {
  const resourceArg = kubectlResourceArg(resource);
  const nsFlag = namespaceFlag(resource, namespaces);
  const outputFlag = dialect === "jq" ? "json" : "yaml";
  const kubectl = `kubectl get ${resourceArg}${nsFlag} -o ${outputFlag}`;

  const toPredicate = (filter: FieldFilter) => dialect === "yq" ? filterToYqPredicate(filter, now) : filterToJqPredicate(filter, now);
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
