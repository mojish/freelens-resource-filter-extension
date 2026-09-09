/**
 * Resource discovery: enumerate all Kubernetes resource kinds registered in the
 * current cluster frame via `Renderer.K8sApi.apiManager`.
 *
 * The ApiManager maintains a MobX observable map `apis` (keyed by apiBase) that
 * merges:
 *   - built-in apis (pods, deployments, ...)
 *   - CRD apis discovered in the cluster (e.g. `Challenge`)
 *   - apis registered by other extensions
 *
 * `getStore(apiBase)` returns a matching `KubeObjectStore`, lazily creating a
 * `CustomResourceStore` for CRDs without a dedicated store. This is the same
 * mechanism `LensExtensionKubeObject.getApi()` uses.
 */

import { computed } from "mobx";
import { Renderer } from "@freelensapp/extensions";

export interface DiscoveredResource {
  /** Unique key for the picker, e.g. "apps/Deployment" */
  id: string;
  kind: string;
  apiVersionWithGroup: string;
  apiBase: string;
  isNamespaced: boolean;
  /** Plural resource name, e.g. "deployments" */
  apiResource: string;
}

type AnyKubeApi = {
  kind: string;
  apiBase: string;
  apiVersionWithGroup: string;
  isNamespaced?: boolean;
  apiResource?: string;
};

type AnyApiManager = {
  apis: Map<string, AnyKubeApi>;
  getStore: (apiBase: string) => unknown | undefined;
};

/** Resolve apiManager lazily — it may not be available at import time. */
function getApiManager(): AnyApiManager | undefined {
  return Renderer.K8sApi.apiManager as unknown as AnyApiManager | undefined;
}

/** All discovered resources, sorted by group then kind. Empty until apiManager is ready. */
export const discoveredResources = computed<DiscoveredResource[]>(() => {
  const manager = getApiManager();
  if (!manager || typeof manager.apis?.values !== "function") {
    return [];
  }

  const seen = new Map<string, DiscoveredResource>();

  for (const api of manager.apis.values()) {
    if (!api?.kind || !api?.apiBase) {
      continue;
    }

    const id = `${api.apiVersionWithGroup}/${api.kind}`;
    if (seen.has(id)) {
      continue;
    }

    seen.set(id, {
      id,
      kind: api.kind,
      apiVersionWithGroup: api.apiVersionWithGroup,
      apiBase: api.apiBase,
      isNamespaced: api.isNamespaced ?? true,
      apiResource: api.apiResource ?? "",
    });
  }

  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
});

/** Resolve the store for a discovered resource (lazily creates CRD stores). */
export function getStoreForResource(resource: DiscoveredResource): KubeStoreLike | undefined {
  const manager = getApiManager();
  if (!manager) {
    return undefined;
  }
  return manager.getStore(resource.apiBase) as KubeStoreLike | undefined;
}

type KubeStoreLike = Renderer.K8sApi.KubeObjectStore;
