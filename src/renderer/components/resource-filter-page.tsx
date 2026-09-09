/**
 * ResourceFilterPage: the extension's cluster page.
 *
 * Layout:
 *   [Resource picker (Select)]  ← all kinds discovered via apiManager
 *   [FilterBar]                 ← field/operator/value rows (ANDed)
 *   [KubeObjectListLayout]      ← generic list for the selected kind
 *
 * The list is generic: fixed Name/Namespace/Age columns + a summary cell built
 * from the object's own fields. Filtering is applied via the `filterItems`
 * prop, which ItemListLayout chains after its built-in search filters.
 *
 * Notes on correctness:
 * - `KubeObjectListLayout` preloads the store itself on mount, so we never
 *   call `store.loadAll()` manually (that would race the layout's own load).
 * - Store resolution (`apiManager.getStore`) lazily CREATES a
 *   `CustomResourceStore` for CRDs — a side effect, so it happens in an
 *   effect, never during render.
 * - The field catalog is rebuilt when items arrive: `store.items` is a stable
 *   observable array whose identity doesn't change, so the memo keys on the
 *   item count and load state too.
 */

import React from "react";
import * as MobxReact from "mobx-react";
import { Renderer } from "@freelensapp/extensions";
import { FilterStore } from "../filtering/filter-store";
import { collectFieldPaths, type FieldCatalog } from "../filtering/field-paths";
import { getStoreForResource, discoveredResources, type DiscoveredResource } from "../discovery/api-discovery";
import { FilterBar } from "./filter-bar";
import { pageStyles, rowStyles } from "./page-styles";

const { observer } = MobxReact;

const {
  Component: { KubeObjectAge, KubeObjectListLayout, LinkToNamespace, Select, WithTooltip },
} = Renderer;

type KubeObject = Renderer.K8sApi.KubeObject;
type KubeStore = Renderer.K8sApi.KubeObjectStore;
type StringOption = { value: string; label: string };

const sortingCallbacks = {
  name: (object: KubeObject) => object.getName(),
  namespace: (object: KubeObject) => object.getNs() ?? "",
  age: (object: KubeObject) => object.getCreationTimestamp(),
};

const renderTableHeader = [
  { title: "Name", sortBy: "name", id: "name", className: "name" },
  { title: "Namespace", sortBy: "namespace", id: "namespace", className: "namespace" },
  { title: "Age", sortBy: "age", id: "age", className: "age" },
  { title: "Summary", id: "summary", className: "summary" },
];

export const ResourceFilterPage = observer(() => {
  // lazily created once, stable identity across renders
  const [filterStore] = React.useState(() => new FilterStore());
  const [selectedId, setSelectedId] = React.useState<string | undefined>(undefined);
  // undefined = not resolved yet; null = resolution failed (no store for kind)
  const [store, setStore] = React.useState<KubeStore | null | undefined>(undefined);

  const resources = discoveredResources.get();

  const resourceOptions: StringOption[] = resources.map((r) => ({ value: r.id, label: r.id }));

  const selected: DiscoveredResource | undefined = React.useMemo(
    () => resources.find((r) => r.id === selectedId),
    [resources, selectedId],
  );

  // resolve (and for CRDs lazily create) the store after render
  React.useEffect(() => {
    setStore(selected ? (getStoreForResource(selected) ?? null) : undefined);
    return undefined;
  }, [selected]);

  const items: KubeObject[] = store ? store.items : [];
  const isLoaded = store?.isLoaded ?? false;

  // rebuild the field catalog when items arrive or change
  const catalog: FieldCatalog = React.useMemo(
    () => collectFieldPaths(items as object[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, items.length, isLoaded],
  );

  const filterItems = React.useCallback(
    (list: KubeObject[]) => list.filter((item) => filterStore.matches(item as object)),
    [filterStore],
  );

  return (
    <div className="ItemListLayout flex column ResourceFilterPage" style={pageStyles.container}>
      <style>{rowStyles}</style>
      <div style={pageStyles.pickerRow}>
        <Select
          className="resource-picker"
          placeholder="1. Select resource kind — type to search (e.g. Challenge, Pod, Cdn…)"
          value={selectedId}
          options={resourceOptions}
          isSearchable
          onChange={(option: StringOption | null) => {
            if (option) {
              setSelectedId(option.value);
            }
          }}
        />
      </div>

      <FilterBar store={filterStore} catalog={catalog} />

      {selected && store === null ? (
        <div style={pageStyles.emptyState}>
          Could not resolve a store for <b>{selected.id}</b> — its API may not be loaded in this cluster.
          <br />
          Try another kind or reselect it.
        </div>
      ) : !selected ? (
        <div style={pageStyles.emptyState}>
          Pick a resource kind above, then use <b>Add filter</b> to build rows like{" "}
          <code>spec.state = pending</code>. Rows combine with AND.
        </div>
      ) : store ? (
        <KubeObjectListLayout<KubeObject, Renderer.K8sApi.KubeApi<KubeObject>>
          tableId={`resourceFilterTable:${selected.id}`}
          store={store}
          className={`ResourceFilter ${selected.kind}`}
          sortingCallbacks={sortingCallbacks}
          searchFilters={[(object: KubeObject) => object.getSearchFields()]}
          renderHeaderTitle={`${selected.kind} (${selected.apiVersionWithGroup})`}
          renderTableHeader={renderTableHeader}
          renderTableContents={renderTableContents}
          filterItems={[filterItems]}
        />
      ) : null}
    </div>
  );
});

function summarize(object: KubeObject): string {
  const record = object as unknown as Record<string, unknown>;
  const parts: string[] = [];

  for (const section of ["spec", "status"] as const) {
    const value = record[section];
    if (value && typeof value === "object") {
      const keys = Object.keys(value as object);
      if (keys.length > 0) {
        parts.push(`${section}: ${keys.slice(0, 3).join(", ")}`);
      }
    }
  }

  return parts.join(" · ");
}

function renderTableContents(object: KubeObject): React.ReactNode[] {
  return [
    <WithTooltip key="name">{object.getName()}</WithTooltip>,
    object.getNs() ? <LinkToNamespace key="namespace" namespace={object.getNs()} /> : "",
    <KubeObjectAge key="age" object={object} />,
    <WithTooltip key="summary">
      <span style={pageStyles.summary}>{summarize(object) || "—"}</span>
    </WithTooltip>,
  ];
}
