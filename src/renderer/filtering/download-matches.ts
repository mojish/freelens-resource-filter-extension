/**
 * Project matched items down to selected output field paths for download.
 */

import { stringify } from "yaml";
import type { KubectlDialect } from "./kubectl-yq";
import { getFieldValues } from "./filter-engine";

/** Pick `paths` from an item. Empty paths → return the item unchanged. */
export function projectItem(item: object, paths: string[]): object {
  const unique = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
  if (unique.length === 0) {
    return item;
  }
  const out: Record<string, unknown> = Object.create(null);
  for (const path of unique) {
    const values = getFieldValues(item, path);
    if (values.length === 0) {
      out[path] = null;
    } else if (values.length === 1) {
      out[path] = values[0] ?? null;
    } else {
      out[path] = values;
    }
  }
  return out;
}

/** Filter + project a list for "Download matches". */
export function downloadPayload(
  items: object[],
  matched: object[],
  outputFields: string[],
): object[] {
  void items;
  return matched.map((item) => projectItem(item, outputFields));
}

/** Both formats serialize the same JSON-compatible resource list, including toJSON(). */
export function serializeDownload(payload: object[], dialect: KubectlDialect): {
  content: string;
  mimeType: string;
  extension: "yaml" | "json";
} {
  const json = JSON.stringify(payload, null, 2);
  return dialect === "yq"
    ? { content: stringify(JSON.parse(json), { compat: "yaml-1.1" }), mimeType: "application/yaml", extension: "yaml" }
    : { content: json, mimeType: "application/json", extension: "json" };
}
