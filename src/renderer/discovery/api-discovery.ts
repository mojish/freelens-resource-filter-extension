/**
 * Resource discovery: enumerate all Kubernetes resource kinds registered in the
 * current cluster frame via `Renderer.K8sApi.apiManager`.
 *
 * The public getApi(predicate) lookup visits the observable registry, merging:
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

/** Resolve apiManager lazily — it may not be available at import time. */
function getApiManager() {
  return Renderer.K8sApi.apiManager;
}

/** All discovered resources, sorted by group then kind. Empty until apiManager is ready. */
export const discoveredResources = computed<DiscoveredResource[]>(() => {
  const manager = getApiManager();
  if (!manager) {
    return [];
  }

  const seen = new Map<string, DiscoveredResource>();

  // Returning false visits every API without accessing the host's private map.
  // Registry reads remain tracked by MobX as CRDs appear or disappear.
  manager.getApi((api) => {
    if (!api?.kind || !api?.apiBase) {
      return false;
    }

    const id = `${api.apiVersionWithGroup}/${api.kind}`;
    if (seen.has(id)) {
      return false;
    }

    seen.set(id, {
      id,
      kind: api.kind,
      apiVersionWithGroup: api.apiVersionWithGroup,
      apiBase: api.apiBase,
      isNamespaced: api.isNamespaced ?? true,
      apiResource: api.apiResource ?? "",
    });
    return false;
  });

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
