/** Parse/serialize filter queries without splitting quoted values or map keys. */
import { filterOperators, parsePath, type FieldFilter, type FilterCombinator, type FilterOperator } from "./filter-engine";

/** Locations of whitespace outside quoted strings (including quoted bracket keys). */
function unquotedSpaces(text: string): Set<number> {
  const spaces = new Set<number>();
  let quote = "";
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if ((char === '"' || char === "'") && (i === 0 || /[\s[]/.test(text[i - 1]))) {
      quote = char;
    } else if (/\s/.test(char)) {
      spaces.add(i);
    }
  }
  if (quote) throw new Error("Unterminated quoted string in query");
  return spaces;
}

function parseValue(raw: string): string {
  if (raw.startsWith('"')) {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value === "string") return value;
    } catch { /* report below */ }
    throw new Error("Invalid quoted query value");
  }
  if (raw.startsWith("'")) {
    if (!/^'(?:[^'\\]|\\.)*'$/.test(raw)) throw new Error("Invalid quoted query value");
    return raw.slice(1, -1).replace(/\\(['\\])/g, "$1");
  }
  return raw;
}

/** Invalid queries throw before any rows are applied; an empty query clears rows. */
export function parseFilterQuery(query: string): Omit<FieldFilter, "id">[] {
  const text = query.trim();
  if (!text) return [];
  const spaces = unquotedSpaces(text);
  const parts: { text: string; combinator: FilterCombinator }[] = [];
  const joins = /\s+(AND|OR)(?=\s|$)/gi;
  let start = 0;
  let combinator: FilterCombinator = "and";
  for (const match of text.matchAll(joins)) {
    if (!spaces.has(match.index!)) continue;
    parts.push({ text: text.slice(start, match.index).trim(), combinator });
    combinator = match[1].toLowerCase() as FilterCombinator;
    start = match.index! + match[0].length;
  }
  parts.push({ text: text.slice(start).trim(), combinator });
  return parts.map((part) => {
    const split = [...unquotedSpaces(part.text)][0];
    if (split === undefined) throw new Error(`Invalid query clause: ${part.text || "(empty)"}`);
    const field = part.text.slice(0, split);
    const match = part.text.slice(split).trim().match(/^(\S+)(?:\s+([\s\S]+))?$/);
    const operator = match?.[1].toLowerCase() as FilterOperator;
    if (!parsePath(field).length || !filterOperators.includes(operator)) {
      throw new Error(`Invalid field or operator in query: ${part.text}`);
    }
    const raw = match?.[2]?.trim() ?? "";
    const existence = operator === "exists" || operator === "!exists";
    if (existence ? raw !== "" : raw === "") {
      throw new Error(existence ? `${operator} takes no value` : `${operator} requires a value`);
    }
    return { field, operator, value: existence ? "" : parseValue(raw), combinator: part.combinator };
  });
}

export function serializeFilterQuery(filters: Array<Pick<FieldFilter, "field" | "operator" | "value" | "combinator">>): string {
  return filters
    .filter((filter) => filter.field !== "" && (filter.operator === "exists" || filter.operator === "!exists" || filter.value !== ""))
    .map((filter, index) => {
      const existence = filter.operator === "exists" || filter.operator === "!exists";
      const value = /[\s"'\\]/.test(filter.value) || /^(AND|OR)$/i.test(filter.value) ? JSON.stringify(filter.value) : filter.value;
      const clause = `${filter.field} ${filter.operator}${existence ? "" : ` ${value}`}`;
      return index === 0 ? clause : `${(filter.combinator ?? "and").toUpperCase()} ${clause}`;
    })
    .join(" ");
}
