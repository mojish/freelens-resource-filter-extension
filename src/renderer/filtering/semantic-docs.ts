/**
 * Short semantic help strings shown next to operators / path wildcards.
 */

import type { FilterOperator } from "./filter-engine";

export const PATH_WILDCARD_HELP =
  "[*] = any array or map value. A match succeeds if ANY element matches (not all).";

export const OPERATOR_HELP: Partial<Record<FilterOperator, string>> = {
  "=": "Case-insensitive equality. For arrays/maps, matches if any element equals the value.",
  "!=": "Case-insensitive inequality. For arrays/maps, matches if any element differs (not “all differ”).",
  contains: "Substring match (case-insensitive). Any element may match.",
  "!contains": "Negated substring. Matches if any element does not contain the value.",
  regex: "JavaScript regex against the string form of each value.",
  in: "Comma-separated list. Matches if any element is one of the values.",
  exists: "Field is present and non-empty.",
  "!exists": "Field is missing or empty.",
  older_than: "Timestamp older than a relative duration (e.g. 7d, 24h, 30m).",
  newer_than: "Timestamp newer than a relative duration (e.g. 7d, 24h, 30m).",
};
