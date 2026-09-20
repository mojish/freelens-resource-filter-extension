/**
 * Parse / serialize a one-line filter query for the power-user query bar.
 *
 * Grammar (simplified):
 *   query  := clause ( (AND|OR) clause )*
 *   clause := field operator value
 *   value  := bareword | "quoted string"
 */

import { filterOperators, type FieldFilter, type FilterCombinator, type FilterOperator } from "./filter-engine";

const OP_PATTERN = filterOperators
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((op) => op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const CLAUSE_RE = new RegExp(
  `^\\s*(\\S+)\\s+(${OP_PATTERN})\\s+(.+?)\\s*$`,
  "i",
);

function parseValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitClauses(query: string): { combinator: FilterCombinator; text: string }[] {
  const parts: { combinator: FilterCombinator; text: string }[] = [];
  const re = /\s+(AND|OR)\s+/gi;
  let lastIndex = 0;
  let combinator: FilterCombinator = "and";
  let match: RegExpExecArray | null;
  while ((match = re.exec(query)) !== null) {
    const text = query.slice(lastIndex, match.index).trim();
    if (text.length > 0) {
      parts.push({ combinator, text });
    }
    combinator = match[1].toUpperCase() === "OR" ? "or" : "and";
    lastIndex = match.index + match[0].length;
  }
  const tail = query.slice(lastIndex).trim();
  if (tail.length > 0) {
    parts.push({ combinator, text: tail });
  }
  return parts;
}

function normalizeOperator(raw: string): FilterOperator | null {
  const lower = raw.toLowerCase();
  return (filterOperators as readonly string[]).includes(lower) ? (lower as FilterOperator) : null;
}

/** Parse a query string into serializable filter rows (no ids). */
export function parseFilterQuery(query: string): Omit<FieldFilter, "id">[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    return [];
  }

  const parts = splitClauses(trimmed);
  const rows: Omit<FieldFilter, "id">[] = [];

  for (const part of parts) {
    const match = part.text.match(CLAUSE_RE);
    if (!match) {
      continue;
    }
    const operator = normalizeOperator(match[2]);
    if (!operator) {
      continue;
    }
    rows.push({
      field: match[1],
      operator,
      value: parseValue(match[3]),
      combinator: part.combinator,
    });
  }

  if (rows.length > 0) {
    rows[0] = { ...rows[0], combinator: "and" };
  }
  return rows;
}

/** Serialize filter rows back to a one-line query (best-effort). */
export function serializeFilterQuery(filters: Array<Pick<FieldFilter, "field" | "operator" | "value" | "combinator">>): string {
  const active = filters.filter(
    (filter) =>
      filter.field !== "" &&
      (filter.operator === "exists" || filter.operator === "!exists" || filter.value !== ""),
  );
  return active
    .map((filter, index) => {
      const needsQuotes = /\s/.test(filter.value);
      const value =
        filter.operator === "exists" || filter.operator === "!exists"
          ? ""
          : needsQuotes
            ? `"${filter.value.replace(/"/g, '\\"')}"`
            : filter.value;
      const clause =
        filter.operator === "exists" || filter.operator === "!exists"
          ? `${filter.field} ${filter.operator}`
          : `${filter.field} ${filter.operator} ${value}`.trim();
      if (index === 0) {
        return clause;
      }
      const join = (filter.combinator ?? "and").toUpperCase();
      return `${join} ${clause}`;
    })
    .join(" ");
}
