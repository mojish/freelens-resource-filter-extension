/**
 * Format the Freelens namespace selection for the page badge.
 */

import type { SelectedNamespaces } from "./kubectl-yq";

export function formatNamespaceBadge(namespaces: SelectedNamespaces): string {
  if (namespaces === "all") {
    return "All namespaces";
  }
  if (namespaces.length === 1) {
    return `Namespace: ${namespaces[0]}`;
  }
  return `Namespaces: ${namespaces.join(", ")}`;
}
