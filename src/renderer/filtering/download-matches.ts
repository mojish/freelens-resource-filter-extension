/**
 * Project matched items down to selected output field paths for download.
 */

import { getFieldValues } from "./filter-engine";

/** Pick `paths` from an item. Empty paths → return the item unchanged. */
export function projectItem(item: object, paths: string[]): object {
  const unique = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
  if (unique.length === 0) {
    return item;
  }
  const out: Record<string, unknown> = {};
  for (const path of unique) {
    const values = getFieldValues(item, path);
    if (values.length === 0) {
      out[path] = null;
    } else if (values.length === 1) {
      out[path] = values[0];
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
