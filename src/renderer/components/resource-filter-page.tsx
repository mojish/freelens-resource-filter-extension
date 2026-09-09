/**
 * ResourceFilterPage: the extension's cluster page.
 *
 * Layout:
 *   [Resource picker (Select)]  ← all kinds discovered via apiManager
 *   [FilterBar]                 ← field/operator/value rows (ANDed), saved sets
 *   [KubeObjectListLayout]      ← generic list for the selected kind
 *
 * The list is generic: Name/Namespace/Age columns, up to two columns derived
 * from the data itself (top spec/status fields by presence), and a summary
 * cell. Filtering is applied via the `filterItems` prop, which ItemListLayout
 * chains after its built-in search filters.
 *
 * Correctness notes:
 * - `KubeObjectListLayout` preloads the store itself on mount, so we never
 *   call `store.loadAll()` manually (that would race the layout's own load).
 * - Store resolution (`apiManager.getStore`) lazily CREATES a
 *   `CustomResourceStore` for CRDs — a side effect, so it happens in an
 *   effect, never during render.
 * - The field catalog is rebuilt when items arrive: `store.items` is a stable
 *   observable array whose identity doesn't change, so the memo keys on the
 *   item count and load state too.
 * - Filters persist per kind (filter-storage) and the last kind is restored.
 * - Filter rows whose field is absent from the current kind are marked stale
 *   in the FilterBar and skipped when filtering.
 */

import React from "react";
import * as MobxReact from "mobx-react";
import * as Mobx from "mobx";
import { Renderer } from "@freelensapp/extensions";
import { FilterStore } from "../filtering/filter-store";
import { collectFieldPaths, derivedColumns, fieldPathsOf, type FieldCatalog } from "../filtering/field-paths";
import { getStoreForResource, discoveredResources, type DiscoveredResource } from "../discovery/api-discovery";
import { createFilterMatcher, getFieldValues } from "../filtering/filter-engine";
import {
  deleteFilterSet,
  loadActiveFilters,
  loadFilterSets,
  loadLastKind,
  saveActiveFilters,
  saveFilterSet,
  saveLastKind,
  type SavedFilterSet,
} from "../filtering/filter-storage";
import { FilterBar, type ListState } from "./filter-bar";
import { pageStyles, rowStyles } from "./page-styles";

const { observer } = MobxReact;
const { autorun } = Mobx;

const {
  Component: { KubeObjectAge, KubeObjectListLayout, LinkToNamespace, Select, WithTooltip },
} = Renderer;

type KubeObject = Renderer.K8sApi.KubeObject;
type KubeStore = Renderer.K8sApi.KubeObjectStore;
type StringOption = { value: string; label: string };

/** Truncate long cell values; the full value is available in the tooltip. */
const MAX_CELL_LENGTH = 60;

function firstValue(object: object, path: string): string {
  const values = getFieldValues(object, path).filter((value) => value !== undefined && value !== null);
  if (values.length === 0) {
    return "";
  }
  return values.map((value) => String(value)).join(", ");
}

function truncate(value: string): string {
  return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH - 1)}…` : value;
}

export const ResourceFilterPage = observer(() => {
  // lazily created once, stable identity across renders
  const [filterStore] = React.useState(() => new FilterStore());
  const [selectedId, setSelectedId] = React.useState<string | undefined>(() => loadLastKind());
  // undefined = not resolved yet; null = resolution failed (no store for kind)
  const [store, setStore] = React.useState<KubeStore | null | undefined>(undefined);
  const [savedSets, setSavedSets] = React.useState<SavedFilterSet[]>([]);

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

  const columns = React.useMemo(() => derivedColumns(catalog), [catalog]);

  // remember the last kind and persist active filters per kind
  React.useEffect(() => {
    if (!selectedId) {
      return undefined;
    }
    saveLastKind(selectedId);

    const saved = loadActiveFilters(selectedId);
    if (saved) {
      filterStore.setFilters(saved);
    } else {
      filterStore.clearFilters();
    }

    // persist every subsequent change of the active rows
    const disposer = autorun(() => {
      saveActiveFilters(selectedId, filterStore.serializable);
    });
    return disposer;
  }, [selectedId, filterStore]);

  // saved sets follow the selected kind
  React.useEffect(() => {
    setSavedSets(selectedId ? loadFilterSets(selectedId) : []);
  }, [selectedId]);

  const onSaveSet = React.useCallback(
    (name: string) => {
      if (selectedId) {
        setSavedSets(saveFilterSet(selectedId, name, filterStore.serializable));
      }
    },
    [selectedId, filterStore],
  );

  const onLoadSet = React.useCallback(
    (name: string) => {
      const set = savedSets.find((candidate) => candidate.name === name);
      if (set) {
        filterStore.setFilters(set.filters);
      }
    },
    [savedSets, filterStore],
  );

  const onDeleteSet = React.useCallback(
    (name: string) => {
      if (selectedId) {
        setSavedSets(deleteFilterSet(selectedId, name));
      }
    },
    [selectedId],
  );

  const listState: ListState = !selected ? "no-kind" : !isLoaded ? "loading" : items.length === 0 ? "empty" : "ready";

  // read during render so the page itself re-renders when rows change
  const activeRows = filterStore.activeFilters;

  const filterItems = React.useCallback(
    (list: KubeObject[]): KubeObject[] => {
      if (activeRows.length === 0) {
        return list;
      }
      const knownPaths = fieldPathsOf(catalog);
      const effective = knownPaths.length === 0 ? activeRows : activeRows.filter((row) => row.field === "" || knownPaths.includes(row.field));
      if (effective.length === 0) {
        return list;
      }
      const matcher = createFilterMatcher(effective);
      return list.filter((item) => matcher(item as object));
    },
    // activeRows is read during render (observable tracking) and captured here
    [activeRows, catalog],
  );

  const sortingCallbacks = React.useMemo(() => {
    const callbacks: Record<string, (object: KubeObject) => string> = {
      name: (object: KubeObject) => object.getName(),
      namespace: (object: KubeObject) => object.getNs() ?? "",
      age: (object: KubeObject) => String(object.getCreationTimestamp()),
    };
    for (const column of columns) {
      callbacks[column.title] = (object: KubeObject) => firstValue(object as object, column.path);
    }
    return callbacks;
  }, [columns]);

  const renderTableHeader = React.useMemo(
    () => [
      { title: "Name", sortBy: "name", id: "name", className: "name" },
      { title: "Namespace", sortBy: "namespace", id: "namespace", className: "namespace" },
      { title: "Age", sortBy: "age", id: "age", className: "age" },
      ...columns.map((column) => ({ title: column.title, sortBy: column.title, id: column.title, className: "derived" })),
      { title: "Summary", id: "summary", className: "summary" },
    ],
    [columns],
  );

  const renderTableContents = React.useCallback(
    (object: KubeObject): React.ReactNode[] => [
      <WithTooltip key="name">{object.getName()}</WithTooltip>,
      object.getNs() ? <LinkToNamespace key="namespace" namespace={object.getNs()} /> : "",
      <KubeObjectAge key="age" object={object} />,
      ...columns.map((column) => (
        <WithTooltip key={column.title}>
          <span style={pageStyles.summary}>{truncate(firstValue(object as object, column.path)) || "—"}</span>
        </WithTooltip>
      )),
      <WithTooltip key="summary">
        <span style={pageStyles.summary}>{summarize(object) || "—"}</span>
      </WithTooltip>,
    ],
    [columns],
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

      <FilterBar
        store={filterStore}
        catalog={catalog}
        listState={listState}
        kindId={selectedId ?? null}
        savedSets={savedSets}
        onSaveSet={onSaveSet}
        onLoadSet={onLoadSet}
        onDeleteSet={onDeleteSet}
      />

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
