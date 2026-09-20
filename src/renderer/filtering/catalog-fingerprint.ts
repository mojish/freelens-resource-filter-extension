/**
 * Fingerprint kube items so the field catalog can skip redundant rebuilds.
 */

export function itemsFingerprint(items: object[]): string {
  const parts: string[] = [];
  for (const item of items) {
    const meta = (item as { metadata?: { uid?: string; resourceVersion?: string; name?: string } }).metadata;
    parts.push(`${meta?.uid ?? meta?.name ?? "?"}:${meta?.resourceVersion ?? ""}`);
  }
  return `${items.length}|${parts.join(",")}`;
}

/** True when the catalog should be rebuilt for the new item set. */
export function shouldRebuildCatalog(
  previousFingerprint: string | undefined,
  nextFingerprint: string,
  _itemCount: number,
): boolean {
  return previousFingerprint !== nextFingerprint;
}
