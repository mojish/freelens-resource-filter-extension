/**
 * ResourceFilterPage: the extension's cluster page.
 *
 * Layout:
 *   [Resource picker]  ← kinds + favorites/recent
 *   [FilterBar]        ← filters, query, kubectl preview, sets
 *   [List + optional object peek]
 */

import React from "react";
import * as MobxReact from "mobx-react";
import * as Mobx from "mobx";
import { Renderer } from "@freelensapp/extensions";
import { FilterStore } from "../filtering/filter-store";
import {
  collectFieldPaths,
  derivedColumns,
  fieldPathsOf,
  SAMPLE_SIZE,
  type FieldCatalog,
} from "../filtering/field-paths";
import { getStoreForResource, discoveredResources, type DiscoveredResource } from "../discovery/api-discovery";
import { createFilterMatcher, getFieldValues } from "../filtering/filter-engine";
import {
  deleteFilterSet,
  loadActiveFilters,
  loadFavoriteKinds,
  loadFilterSets,
  loadKindSession,
  loadLastKind,
  loadRecentKinds,
  loadUiChrome,
  saveActiveFilters,
  saveFilterSet,
  saveKindSession,
  saveLastKind,
  saveRecentKind,
  toggleFavoriteKind,
  type SavedFilterSet,
} from "../filtering/filter-storage";
import { emptyMatchHints } from "../filtering/empty-state";
import { itemsFingerprint, shouldRebuildCatalog } from "../filtering/catalog-fingerprint";
import { filterItemsByNamespace } from "../filtering/namespace-scope";
import type { KubectlDialect, SelectedNamespaces } from "../filtering/kubectl-yq";
import { FilterBar, selectedNamespaces, type ListState } from "./filter-bar";
import { pageStyles, rowStyles } from "./page-styles";

const { observer } = MobxReact;
const { autorun } = Mobx;

const {
  Component: { KubeObjectAge, KubeObjectListLayout, LinkToNamespace, Select, WithTooltip, Button },
} = Renderer;

type KubeObject = Renderer.K8sApi.KubeObject;
type KubeStore = Renderer.K8sApi.KubeObjectStore;
type StringOption = { value: string; label: string };

const MAX_CELL_LENGTH = 60;

function firstValue(object: object, path: string): string {
  const values = getFieldValues(object, path).filter((value) => value !== undefined && value !== null);
  if (values.length === 0) {
    return "";
  }
  return values.map((value) => typeof value === "object" ? JSON.stringify(value) : String(value)).join(", ");
}

function truncate(value: string): string {
  return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH - 1)}…` : value;
}

function columnTitle(path: string): string {
  const leaf = path.split(".").pop() ?? path;
  return leaf.replace(/\[\*\]/g, "[]");
}

export const ResourceFilterPage = observer(() => {
  const [filterStore] = React.useState(() => new FilterStore());
  const [selectedId, setSelectedId] = React.useState<string | undefined>(() => loadLastKind());
  const [resolvedStore, setResolvedStore] = React.useState<{ apiBase: string; store: KubeStore | null }>();
  const [sessionKindId, setSessionKindId] = React.useState<string>();
  const [now, setNow] = React.useState(() => Date.now());
  const [savedSets, setSavedSets] = React.useState<SavedFilterSet[]>([]);
  const [outputFields, setOutputFields] = React.useState<string[]>([]);
  const [userColumns, setUserColumns] = React.useState<string[]>([]);
  const [dialect, setDialect] = React.useState<KubectlDialect>("yq");
  const [favorites, setFavorites] = React.useState<string[]>(() => loadFavoriteKinds());
  const [recent, setRecent] = React.useState<string[]>(() => loadRecentKinds());
  const [detailObject, setDetailObject] = React.useState<KubeObject | null>(null);
  const [nsSnapshot, setNsSnapshot] = React.useState<SelectedNamespaces>(() => selectedNamespaces());
  const catalogFingerprintRef = React.useRef<string | undefined>(undefined);
  const catalogCacheRef = React.useRef<FieldCatalog>(collectFieldPaths([]));

  // Re-read favorites/recent from storage when kinds appear and on focus.
  // Cluster frames sometimes mount before localStorage is readable.
  React.useEffect(() => {
    const reload = (): void => {
      const chrome = loadUiChrome();
      setFavorites(chrome.favorites);
      setRecent(chrome.recent);
    };
    reload();
    const timer = window.setTimeout(reload, 500);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, []);

  const resources = discoveredResources.get();

  // When the kind list first becomes available, re-apply stored favorites/recent.
  React.useEffect(() => {
    if (resources.length === 0) {
      return;
    }
    const chrome = loadUiChrome();
    setFavorites(chrome.favorites);
    setRecent(chrome.recent);
  }, [resources.length]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setNsSnapshot(selectedNamespaces());
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const resourceOptions: StringOption[] = React.useMemo(() => {
    const scored = resources.map((r) => {
      const favorite = favorites.includes(r.id);
      const recentIndex = recent.indexOf(r.id);
      const prefix = favorite ? "★ " : recentIndex >= 0 ? "↻ " : "";
      return {
        value: r.id,
        label: `${prefix}${r.id}`,
        favorite,
        recentIndex,
      };
    });
    scored.sort((a, b) => {
      if (a.favorite !== b.favorite) {
        return a.favorite ? -1 : 1;
      }
      if (a.recentIndex === -1 && b.recentIndex === -1) {
        return a.value.localeCompare(b.value);
      }
      if (a.recentIndex === -1) {
        return 1;
      }
      if (b.recentIndex === -1) {
        return -1;
      }
      return a.recentIndex - b.recentIndex;
    });
    return scored.map(({ value, label }) => ({ value, label }));
  }, [resources, favorites, recent]);

  const selected: DiscoveredResource | undefined = React.useMemo(
    () => resources.find((r) => r.id === selectedId),
    [resources, selectedId],
  );

  React.useEffect(() => {
    setResolvedStore(selected ? { apiBase: selected.apiBase, store: getStoreForResource(selected) ?? null } : undefined);
    return undefined;
  }, [selected]);

  // Never mount the newly selected kind with the previous kind's store.
  const store = resolvedStore?.apiBase === selected?.apiBase ? resolvedStore?.store : undefined;
  const items: KubeObject[] = store ? store.items : [];
  const isLoaded = store?.isLoaded ?? false;

  // Observe resource versions during every render; host arrays can mutate in place.
  const fp = itemsFingerprint(items as object[]);
  const catalog: FieldCatalog = React.useMemo(() => {
    if (!shouldRebuildCatalog(catalogFingerprintRef.current, fp, items.length)) {
      return catalogCacheRef.current;
    }
    catalogFingerprintRef.current = fp;
    const next = collectFieldPaths(items as object[]);
    catalogCacheRef.current = next;
    return next;
  }, [items, fp, isLoaded]);

  const autoColumns = React.useMemo(() => derivedColumns(catalog), [catalog]);
  const columns = React.useMemo(() => {
    if (userColumns.length === 0) {
      return autoColumns;
    }
    const titles = userColumns.map(columnTitle);
    return userColumns.map((path, index) => ({
      path, title: titles.filter((title) => title === titles[index]).length > 1 ? path : titles[index],
    }));
  }, [userColumns, autoColumns]);

  React.useEffect(() => {
    if (!selectedId) {
      return undefined;
    }
    saveLastKind(selectedId);
    saveRecentKind(selectedId);
    setRecent(loadRecentKinds());

    const saved = loadActiveFilters(selectedId);
    if (saved) {
      filterStore.setFilters(saved);
    } else {
      filterStore.clearFilters();
    }
    const session = loadKindSession(selectedId);
    setOutputFields(session.outputFields);
    setUserColumns(session.columns);
    setDialect(session.dialect);
    setSessionKindId(selectedId);
    setDetailObject(null);

    const disposer = autorun(() => {
      saveActiveFilters(selectedId, filterStore.serializable);
    });
    return disposer;
  }, [selectedId, filterStore]);

  React.useEffect(() => {
    if (!selectedId || selectedId !== sessionKindId) {
      return;
    }
    saveKindSession(selectedId, { outputFields, columns: userColumns, dialect });
  }, [selectedId, sessionKindId, outputFields, userColumns, dialect]);

  React.useEffect(() => {
    setSavedSets(selectedId ? loadFilterSets(selectedId) : []);
  }, [selectedId]);

  const onSaveSet = React.useCallback(
    (name: string) => {
      if (selectedId) {
        setSavedSets(
          saveFilterSet(selectedId, name, filterStore.serializable, {
            outputFields,
            columns: userColumns,
          }),
        );
      }
    },
    [selectedId, filterStore, outputFields, userColumns],
  );

  const onLoadSet = React.useCallback(
    (name: string) => {
      const set = savedSets.find((candidate) => candidate.name === name);
      if (set) {
        filterStore.setFilters(set.filters);
        setOutputFields(set.outputFields ?? []);
        setUserColumns(set.columns ?? []);
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

  // Read signature during render so AND/OR and removals invalidate match counts.
  const matchSignature = filterStore.matchSignature;
  const activeRows = filterStore.activeFilters;
  void filterStore.revision;

  const scopedItems = React.useMemo(
    () => filterItemsByNamespace([...items] as object[], nsSnapshot),
    [items, fp, nsSnapshot],
  );

  const filteredItems = React.useMemo(() => {
    if (activeRows.length === 0) {
      return scopedItems;
    }
    const matcher = createFilterMatcher(activeRows, now);
    return scopedItems.filter((item) => matcher(item));
  }, [scopedItems, activeRows, matchSignature, now]);

  const filterItems = React.useCallback(
    (list: KubeObject[]): KubeObject[] => {
      // Apply Freelens namespace scope first (layout may or may not have done this).
      const scoped = filterItemsByNamespace(list as object[], selectedNamespaces()) as KubeObject[];
      if (activeRows.length === 0) {
        return scoped;
      }
      const matcher = createFilterMatcher(activeRows, now);
      return scoped.filter((item) => matcher(item as object));
    },
    [activeRows, matchSignature, now],
  );

  const emptyHints = React.useMemo(
    () =>
      emptyMatchHints({
        filters: activeRows,
        knownPaths: fieldPathsOf(catalog),
      }),
    [activeRows, catalog, matchSignature],
  );

  const catalogSampleNote =
    isLoaded && items.length > SAMPLE_SIZE
      ? `Catalog from first ${SAMPLE_SIZE} of ${items.length}`
      : null;

  const sortingCallbacks = React.useMemo(() => {
    const callbacks: Record<string, (object: KubeObject) => string> = {
      name: (object: KubeObject) => object.getName(),
      namespace: (object: KubeObject) => object.getNs() ?? "",
      age: (object: KubeObject) => String(object.getCreationTimestamp()),
    };
    for (const column of columns) {
      callbacks[`field:${column.path}`] = (object: KubeObject) => firstValue(object as object, column.path);
    }
    return callbacks;
  }, [columns]);

  const renderTableHeader = React.useMemo(
    () => [
      { title: "Name", sortBy: "name", id: "name", className: "name" },
      { title: "Namespace", sortBy: "namespace", id: "namespace", className: "namespace" },
      { title: "Age", sortBy: "age", id: "age", className: "age" },
      ...columns.map((column) => ({
        title: column.title,
        sortBy: `field:${column.path}`,
        id: `field:${column.path}`,
        className: "derived",
      })),
      { title: "Summary", id: "summary", className: "summary" },
    ],
    [columns],
  );

  const renderTableContents = React.useCallback(
    (object: KubeObject): React.ReactNode[] => [
      <button
        key="name"
        type="button"
        className="resource-filter-name-link"
        onClick={() => setDetailObject(object)}
        title="Click name to peek object JSON in the side panel"
      >
        <WithTooltip>{object.getName()}</WithTooltip>
      </button>,
      object.getNs() ? <LinkToNamespace key="namespace" namespace={object.getNs()} /> : "",
      <KubeObjectAge key="age" object={object} />,
      ...columns.map((column) => (
        <WithTooltip key={column.path}>
          <span style={pageStyles.summary}>{truncate(firstValue(object as object, column.path)) || "—"}</span>
        </WithTooltip>
      )),
      <WithTooltip key="summary">
        <span style={pageStyles.summary}>{summarize(object) || "—"}</span>
      </WithTooltip>,
    ],
    [columns],
  );

  const isFavorite = selectedId ? favorites.includes(selectedId) : false;

  // Freelens Select creates a new Menu component on every render. Keep this
  // element stable so namespace polling and item updates don't reset its scroll.
  const resourcePicker = React.useMemo(
    () => (
      <Select
        className="resource-picker"
        placeholder="1. Select resource kind — this page's favorites ★ and recent ↻ sort first"
        value={selectedId}
        options={resourceOptions}
        isSearchable
        onChange={(option: StringOption | null) => {
          if (option) {
            setSelectedId(option.value);
          }
        }}
      />
    ),
    [selectedId, resourceOptions],
  );

  return (
    <div className="ItemListLayout flex column ResourceFilterPage" style={pageStyles.container}>
      <style>{rowStyles}</style>
      <div style={pageStyles.pickerRow} title="Resource Filter favorites are separate from Freelens sidebar favorites.">
        {resourcePicker}
        {selectedId && (
          <Button
            label={isFavorite ? "Unfavorite" : "Favorite"}
            data-testid="toggle-favorite"
            onClick={() => {
              const next = toggleFavoriteKind(selectedId);
              setFavorites(next);
            }}
          />
        )}
      </div>

      <FilterBar
        key={selectedId ?? "no-kind"}
        store={filterStore}
        now={now}
        catalog={catalog}
        listState={listState}
        kindId={selectedId ?? null}
        resource={
          selected
            ? {
                apiResource: selected.apiResource,
                apiVersionWithGroup: selected.apiVersionWithGroup,
                kind: selected.kind,
                isNamespaced: selected.isNamespaced,
              }
            : null
        }
        savedSets={savedSets}
        onSaveSet={onSaveSet}
        onLoadSet={onLoadSet}
        onDeleteSet={onDeleteSet}
        outputFields={outputFields}
        onOutputFieldsChange={setOutputFields}
        columns={userColumns}
        onColumnsChange={setUserColumns}
        dialect={dialect}
        onDialectChange={setDialect}
        suggestionItems={scopedItems}
        matchCount={filteredItems.length}
        totalCount={scopedItems.length}
        catalogSampleNote={catalogSampleNote}
        emptyHints={emptyHints}
      />

      {selected && store === null ? (
        <div style={pageStyles.emptyState}>
          Could not resolve a store for <b>{selected.id}</b> — its API may not be loaded in this cluster.
          <br />
          Try another kind or reselect it.
        </div>
      ) : !selected ? (
        <div style={pageStyles.emptyState}>
          Pick a resource kind above, then use <b>Add filter</b> or the query bar. Rows combine with AND; toggle OR
          between rows when needed.
        </div>
      ) : store ? (
        <div className="resource-filter-list-wrap" style={{ display: "flex", gap: 8, minHeight: 0, flex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="resource-filter-list-hint">Tip: click a resource name to peek its JSON.</div>
            <KubeObjectListLayout<KubeObject, Renderer.K8sApi.KubeApi<KubeObject>>
              key={selected.id}
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
          </div>
          {detailObject && (
            <aside className="resource-filter-drawer" data-testid="yaml-drawer">
              <div className="resource-filter-drawer-header flex gaps align-center">
                <strong>{detailObject.getName()}</strong>
                <Button label="Close" onClick={() => setDetailObject(null)} />
              </div>
              <pre className="resource-filter-drawer-body">{JSON.stringify(detailObject, null, 2)}</pre>
            </aside>
          )}
        </div>
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
