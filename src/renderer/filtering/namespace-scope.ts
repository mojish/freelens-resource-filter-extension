/**
 * Apply Freelens namespace picker scope to in-memory items.
 */

import type { SelectedNamespaces } from "./kubectl-yq";

function itemNamespace(item: object): string | undefined {
  const meta = (item as { metadata?: { namespace?: unknown }; getNs?: () => string | undefined }).metadata;
  if (meta && typeof meta.namespace === "string" && meta.namespace.length > 0) {
    return meta.namespace;
  }
  const getNs = (item as { getNs?: () => string | undefined }).getNs;
  if (typeof getNs === "function") {
    const ns = getNs.call(item);
    return ns && ns.length > 0 ? ns : undefined;
  }
  return undefined;
}

/** True when `item` is visible under the Freelens namespace selection. */
export function matchesNamespaceFilter(item: object, namespaces: SelectedNamespaces): boolean {
  if (namespaces === "all") {
    return true;
  }
  const ns = itemNamespace(item);
  // Cluster-scoped objects have no namespace — keep them visible.
  if (ns == null) {
    return true;
  }
  return namespaces.includes(ns);
}

export function filterItemsByNamespace(items: object[], namespaces: SelectedNamespaces): object[] {
  if (namespaces === "all") {
    return items;
  }
  return items.filter((item) => matchesNamespaceFilter(item, namespaces));
}
