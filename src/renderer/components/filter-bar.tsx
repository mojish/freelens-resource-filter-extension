/**
 * FilterBar: field/operator/value rows, query bar, kubectl preview, saved sets.
 *
 * Field search uses a custom combobox (Freelens Select hardcodes filterOption).
 * Rows combine with AND by default; each row after the first can switch to OR.
 */

import React from "react";
import * as MobxReact from "mobx-react";
import { Renderer } from "@freelensapp/extensions";
import {
  filterOperators,
  createFilterMatcher,
  type FieldFilter,
  type FilterCombinator,
  type FilterOperator,
} from "../filtering/filter-engine";
import type { FilterStore } from "../filtering/filter-store";
import { fieldPathsOf, type FieldCatalog } from "../filtering/field-paths";
import {
  looksLikeFieldPath,
  rankFieldPathMatches,
  resolveFieldPathPick,
} from "../filtering/field-path-search";
import {
  buildKubectlYqCommand,
  type KubectlDialect,
  type KubectlResourceRef,
  type SelectedNamespaces,
} from "../filtering/kubectl-yq";
import type { SavedFilterSet } from "../filtering/filter-storage";
import { parseFilterQuery, serializeFilterQuery } from "../filtering/filter-query";
import { valueSuggestionsFromItems } from "../filtering/filtered-values";
import { downloadPayload } from "../filtering/download-matches";
import { filterItemsByNamespace } from "../filtering/namespace-scope";
import { OPERATOR_HELP, PATH_WILDCARD_HELP } from "../filtering/semantic-docs";
import { formatNamespaceBadge } from "../filtering/namespace-badge";
import { loadPreviewOpen, savePreviewOpen } from "../filtering/filter-storage";

const { observer } = MobxReact;

const {
  Component: { Select, Button, Icon },
} = Renderer;

type StringOption = { value: string; label: string };

export type ListState = "no-kind" | "loading" | "empty" | "ready";

export interface FilterBarProps {
  store: FilterStore;
  catalog: FieldCatalog;
  listState: ListState;
  kindId: string | null;
  resource: KubectlResourceRef | null;
  savedSets: SavedFilterSet[];
  onSaveSet: (name: string) => void;
  onLoadSet: (name: string) => void;
  onDeleteSet: (name: string) => void;
  outputFields: string[];
  onOutputFieldsChange: (fields: string[]) => void;
  columns: string[];
  onColumnsChange: (columns: string[]) => void;
  dialect: KubectlDialect;
  onDialectChange: (dialect: KubectlDialect) => void;
  suggestionItems: object[];
  matchCount: number;
  totalCount: number;
  catalogSampleNote: string | null;
  emptyHints: string[];
}

const fieldPlaceholderByState: Record<ListState, string> = {
  "no-kind": "Field (pick a resource kind first)",
  loading: "Field (loading items…)",
  empty: "Field (this kind has no items)",
  ready: "Field (e.g. status.phase)",
};

const valuePlaceholderByOperator: Partial<Record<FilterOperator, string>> = {
  in: "value1, value2, …",
  regex: "^pending$",
  older_than: "7d",
  newer_than: "24h",
};

/** Human labels — Freelens Select substring-matches values and confuses older_than/newer_than. */
const OPERATOR_OPTIONS: { value: FilterOperator; label: string }[] = filterOperators.map((op) => ({
  value: op,
  label:
    op === "older_than" ? "older than" : op === "newer_than" ? "newer than" : op === "!contains" ? "not contains" : op === "!exists" ? "not exists" : op,
}));

const MAX_FIELD_SUGGESTIONS = 80;

const OUTPUT_PRESETS: { label: string; path: string }[] = [
  { label: "name", path: "metadata.name" },
  { label: "namespace", path: "metadata.namespace" },
  { label: "spec", path: "spec" },
  { label: "status", path: "status" },
];

type NamespaceStoreLike = {
  contextNamespaces?: string[];
  allowedNamespaces?: string[];
  areAllSelectedImplicitly?: boolean;
  hasAllContexts?: boolean;
};

export function selectedNamespaces(): SelectedNamespaces {
  try {
    const nsStore = Renderer.K8sApi.namespaceStore as NamespaceStoreLike | undefined;
    if (!nsStore) {
      return "all";
    }
    if (nsStore.areAllSelectedImplicitly) {
      return "all";
    }
    if (nsStore.hasAllContexts) {
      return "all";
    }
    const names = [...(nsStore.contextNamespaces ?? [])].filter((name) => name.length > 0);
    if (names.length === 0) {
      return "all";
    }
    const allowed = nsStore.allowedNamespaces ?? [];
    if (allowed.length > 0 && names.length >= allowed.length) {
      return "all";
    }
    return names;
  } catch {
    return "all";
  }
}

export const FilterBar = observer(
  ({
    store,
    catalog,
    listState,
    kindId,
    resource,
    savedSets,
    onSaveSet,
    onLoadSet,
    onDeleteSet,
    outputFields,
    onOutputFieldsChange,
    columns,
    onColumnsChange,
    dialect,
    onDialectChange,
    suggestionItems,
    matchCount,
    totalCount,
    catalogSampleNote,
    emptyHints,
  }: FilterBarProps) => {
    const paths = fieldPathsOf(catalog);
    const [setName, setSetName] = React.useState("");
    const [activeSetName, setActiveSetName] = React.useState<string | undefined>(undefined);
    const [copied, setCopied] = React.useState(false);
    const [queryText, setQueryText] = React.useState("");
    const [nsSnapshot, setNsSnapshot] = React.useState<SelectedNamespaces>(() => selectedNamespaces());
    const [previewOpen, setPreviewOpen] = React.useState(() => loadPreviewOpen());

    // Track revision + signature during render (no useMemo) so remove/OR always refresh preview.
    void store.revision;
    const activeFilters = store.activeFilters;
    const matchSignature = store.matchSignature;

    React.useEffect(() => {
      const id = window.setInterval(() => setNsSnapshot(selectedNamespaces()), 1000);
      return () => window.clearInterval(id);
    }, []);

    const setPreviewOpenAndPersist = (open: boolean): void => {
      setPreviewOpen(open);
      savePreviewOpen(open);
    };
    const querySerialized = serializeFilterQuery(store.filters);
    React.useEffect(() => {
      setQueryText(querySerialized);
    }, [querySerialized]);

    React.useEffect(() => {
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== "/") {
          return;
        }
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-testid="filter-query-bar"]')?.focus();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    const setOptions: StringOption[] = savedSets.map((set) => ({ value: set.name, label: set.name }));

    const toggleOutputField = (path: string): void => {
      onOutputFieldsChange(
        outputFields.includes(path) ? outputFields.filter((item) => item !== path) : [...outputFields, path],
      );
    };

    const addOutputField = (path: string): void => {
      if (!outputFields.includes(path)) {
        onOutputFieldsChange([...outputFields, path]);
      }
    };

    const toggleColumn = (path: string): void => {
      onColumnsChange(columns.includes(path) ? columns.filter((item) => item !== path) : [...columns, path]);
    };

    const addColumn = (path: string): void => {
      if (!columns.includes(path)) {
        onColumnsChange([...columns, path]);
      }
    };

    const saveCurrentSet = (): void => {
      const name = setName.trim();
      if (!kindId || !name) {
        return;
      }
      onSaveSet(name);
      setSetName("");
      setActiveSetName(name);
    };

    const previewCommand = resource
      ? buildKubectlYqCommand(resource, activeFilters, nsSnapshot, outputFields, dialect, "objects")
      : "";
    void matchSignature;

    const copyCommand = async (): Promise<void> => {
      if (!resource) {
        return;
      }
      const command = buildKubectlYqCommand(
        resource,
        store.activeFilters,
        selectedNamespaces(),
        outputFields,
        dialect,
        "objects",
      );
      try {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        window.prompt("Copy command:", command);
      }
    };

    const downloadMatches = (): void => {
      // Honor Freelens namespace picker the same way the table / kubectl command do.
      const namespaces = selectedNamespaces();
      const inScope = filterItemsByNamespace(suggestionItems, namespaces);
      const matched =
        store.activeFilters.length === 0 ? inScope : inScope.filter(createFilterMatcher(store.activeFilters));
      const payload = downloadPayload(inScope, matched, outputFields);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${resource?.kind ?? "resources"}-filtered.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    const applyQuery = (): void => {
      const parsed = parseFilterQuery(queryText);
      if (parsed.length > 0) {
        store.setFilters(parsed);
      }
    };

    const canCopy = Boolean(resource && (store.hasFilters || outputFields.length > 0));

    return (
      <div className="resource-filter-bar flex column gaps" data-testid="resource-filter-bar">
        <div className="flex gaps align-center wrap resource-filter-meta">
          <span className="resource-filter-ns-badge" data-testid="namespace-badge" title="Matches Freelens namespace picker">
            {formatNamespaceBadge(nsSnapshot)}
          </span>
          {totalCount > 0 && (
            <span className="resource-filter-match-count" data-testid="match-count">
              {matchCount} / {totalCount} items
            </span>
          )}
          {catalogSampleNote && (
            <span className="resource-filter-catalog-note" title={catalogSampleNote}>
              {catalogSampleNote}
            </span>
          )}
          <span className="resource-filter-help" title={PATH_WILDCARD_HELP}>
            [*] ?
          </span>
        </div>

        <div className="flex gaps align-center resource-filter-query">
          <input
            className="resource-filter-query-input box grow"
            data-testid="filter-query-bar"
            placeholder='Query: spec.state = pending OR status.phase = Running'
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyQuery();
              }
            }}
          />
          <Button label="Apply query" onClick={applyQuery} data-testid="apply-query" />
        </div>

        {store.filters.map((filter, index) => (
          <FilterRow
            key={filter.id}
            filter={filter}
            index={index}
            store={store}
            paths={paths}
            listState={listState}
            suggestionItems={suggestionItems}
          />
        ))}

        {matchCount === 0 && store.hasFilters && emptyHints.length > 0 && (
          <div className="resource-filter-empty-hints" data-testid="empty-hints">
            <div>No items match.</div>
            <ul>
              {emptyHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gaps align-center wrap">
          <Button primary label="Add filter" onClick={() => store.addFilter()} data-testid="add-filter" />
          {store.hasFilters && <Button label="Clear all" onClick={() => store.clearFilters()} />}

          <span className="resource-filter-sets-divider" />
          <button
            type="button"
            className={`resource-filter-chip${dialect === "yq" ? " is-active" : ""}`}
            onClick={() => onDialectChange("yq")}
            title="mikefarah/yq v4 (kubectl -o yaml)"
          >
            yq
          </button>
          <button
            type="button"
            className={`resource-filter-chip${dialect === "jq" ? " is-active" : ""}`}
            onClick={() => onDialectChange("jq")}
            title="jq (kubectl -o json — jq cannot parse YAML)"
          >
            jq
          </button>

          {canCopy && (
            <Button
              label={copied ? "Copied!" : `Copy kubectl|${dialect}`}
              onClick={() => {
                void copyCommand();
              }}
              data-testid="copy-kubectl-yq"
            />
          )}
          {resource && (
            <Button
              label="Download matches"
              onClick={downloadMatches}
              disabled={matchCount === 0}
              data-testid="download-matches"
            />
          )}

          {kindId && (
            <>
              <span className="resource-filter-sets-divider" />
              <input
                className="resource-filter-set-name"
                placeholder="Set name"
                value={setName}
                onChange={(event) => setSetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    saveCurrentSet();
                  }
                }}
              />
              <Button
                label="Save set"
                disabled={!setName.trim() || !store.hasFilters}
                onClick={saveCurrentSet}
              />
              {setOptions.length > 0 && (
                <Select
                  className="resource-filter-sets"
                  placeholder="Saved sets"
                  value={activeSetName}
                  options={setOptions}
                  onChange={(option: StringOption | null) => {
                    if (option) {
                      onLoadSet(option.value);
                      setActiveSetName(option.value);
                    }
                  }}
                />
              )}
              {activeSetName && (
                <Icon
                  material="delete"
                  title={`Delete set "${activeSetName}"`}
                  onClick={() => {
                    onDeleteSet(activeSetName);
                    setActiveSetName(undefined);
                  }}
                />
              )}
            </>
          )}
        </div>

        {resource && (
          <div className="resource-filter-output flex column gaps" data-testid="kubectl-output-fields">
            <div className="flex gaps align-center wrap">
              <span className="resource-filter-output-label">kubectl output fields</span>
              <button
                type="button"
                className={`resource-filter-chip${outputFields.length === 0 ? " is-active" : ""}`}
                onClick={() => onOutputFieldsChange([])}
                title="Emit the full matching object"
              >
                Full object
              </button>
              {OUTPUT_PRESETS.map((preset) => (
                <button
                  key={preset.path}
                  type="button"
                  className={`resource-filter-chip${outputFields.includes(preset.path) ? " is-active" : ""}`}
                  onClick={() => toggleOutputField(preset.path)}
                >
                  {preset.label}
                </button>
              ))}
              <div className="resource-filter-output-add">
                <FieldPathPicker
                  paths={paths}
                  value=""
                  placeholder="Add field…"
                  onChange={addOutputField}
                />
              </div>
            </div>
            {outputFields.length > 0 && (
              <div className="flex gaps align-center wrap">
                {outputFields.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="resource-filter-chip is-active"
                    onClick={() => toggleOutputField(path)}
                    title={`Remove ${path}`}
                  >
                    {path} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {resource && (
          <div className="resource-filter-columns flex column gaps" data-testid="user-columns">
            <div className="flex gaps align-center wrap">
              <span className="resource-filter-output-label">Table columns</span>
              <div className="resource-filter-output-add">
                <FieldPathPicker
                  paths={paths}
                  value=""
                  placeholder="Pin column path…"
                  onChange={addColumn}
                />
              </div>
            </div>
            {columns.length > 0 && (
              <div className="flex gaps align-center wrap">
                {columns.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="resource-filter-chip is-active"
                    onClick={() => toggleColumn(path)}
                  >
                    {path} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {previewCommand && (
          <details
            className="resource-filter-preview"
            data-testid="kubectl-preview"
            open={previewOpen}
            onToggle={(event) => {
              setPreviewOpenAndPersist((event.currentTarget as HTMLDetailsElement).open);
            }}
          >
            <summary className="resource-filter-preview-summary">
              Live kubectl|{dialect} command · {matchCount}/{totalCount} items
            </summary>
            <textarea
              className="resource-filter-preview-text"
              readOnly
              value={previewCommand}
              rows={3}
              data-testid="kubectl-preview-text"
            />
          </details>
        )}
      </div>
    );
  },
);

interface FilterRowProps {
  filter: FieldFilter;
  index: number;
  store: FilterStore;
  paths: string[];
  listState: ListState;
  suggestionItems: object[];
}

const FilterRow = observer(({ filter, index, store, paths, listState, suggestionItems }: FilterRowProps) => {
  const peerFiltered = React.useMemo(() => {
    const others = store.activeFilters.filter((row) => row.id !== filter.id);
    if (others.length === 0) {
      return suggestionItems;
    }
    const matcher = createFilterMatcher(others);
    return suggestionItems.filter((item) => matcher(item));
  }, [suggestionItems, store.activeFilters, store.matchSignature, filter.id]);

  const suggestions = valueSuggestionsFromItems(peerFiltered, filter.field);
  const needsValue = filter.operator !== "exists" && filter.operator !== "!exists";
  const stale = filter.field !== "" && paths.length > 0 && !paths.includes(filter.field);
  const combinator = filter.combinator ?? "and";

  return (
    <div
      className={`flex gaps align-center${stale ? " resource-filter-row-stale" : ""}`}
      data-testid="resource-filter-row"
    >
      {index > 0 ? (
        <button
          type="button"
          className={`resource-filter-combinator${combinator === "or" ? " is-or" : ""}`}
          title="Toggle AND/OR with the previous row"
          onClick={() =>
            store.updateFilter(filter.id, { combinator: (combinator === "or" ? "and" : "or") as FilterCombinator })
          }
          data-testid="filter-combinator"
        >
          {combinator.toUpperCase()}
        </button>
      ) : (
        <span className="resource-filter-combinator-spacer" />
      )}

      <FieldPathPicker
        paths={paths}
        value={filter.field}
        placeholder={fieldPlaceholderByState[listState]}
        onChange={(path) => store.updateFilter(filter.id, { field: path, value: "" })}
      />

      {/* Native <select> — Freelens Select substring-matches and flips newer_than ↔ older_than */}
      <select
        className="resource-filter-operator-native"
        data-testid="filter-operator"
        value={filter.operator}
        title={OPERATOR_HELP[filter.operator] ?? ""}
        onChange={(event) => {
          store.updateFilter(filter.id, { operator: event.target.value as FilterOperator });
        }}
      >
        {OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="resource-filter-help" title={OPERATOR_HELP[filter.operator] ?? ""}>
        ?
      </span>

      {needsValue ? (
        <>
          <input
            className="resource-filter-value box grow"
            list={`resource-filter-suggestions-${filter.id}`}
            placeholder={
              valuePlaceholderByOperator[filter.operator] ??
              (suggestions.length > 0 ? `e.g. ${suggestions[0]}` : "Value")
            }
            value={filter.value}
            onChange={(event) => store.updateFilter(filter.id, { value: event.target.value })}
          />
          <datalist id={`resource-filter-suggestions-${filter.id}`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </>
      ) : (
        <div className="resource-filter-value-placeholder box grow" />
      )}

      {stale ? (
        <Icon
          material="warning"
          title="Field is not present in this kind — this row is ignored"
          className="resource-filter-stale-icon"
        />
      ) : null}

      <Icon material="close" title="Remove filter" onClick={() => store.removeFilter(filter.id)} />
    </div>
  );
});

interface FieldPathPickerProps {
  paths: string[];
  value: string;
  placeholder: string;
  onChange: (path: string) => void;
}

/** Own combobox — Freelens Select cannot do multi-word / regex field search. */
function FieldPathPicker({ paths, value, placeholder, onChange }: FieldPathPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();
  const matches = React.useMemo(() => rankFieldPathMatches(paths, query), [paths, query]);
  const visible = matches.slice(0, MAX_FIELD_SUGGESTIONS);
  const hasExact = matches.some((path) => path.toLowerCase() === trimmedQuery.toLowerCase());
  const showUseTyped =
    trimmedQuery.length > 0 && !hasExact && (looksLikeFieldPath(trimmedQuery) || paths.includes(trimmedQuery));
  const menuItems = showUseTyped ? [`__typed__:${trimmedQuery}`, ...visible] : visible;

  React.useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onDocMouseDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const pick = (path: string): void => {
    onChange(path);
    setQuery("");
    setOpen(false);
  };

  const pickHighlighted = (): void => {
    const item = menuItems[highlight];
    if (!item) {
      const choice = resolveFieldPathPick(paths, query);
      if (choice) {
        pick(choice);
      }
      return;
    }
    if (item.startsWith("__typed__:")) {
      pick(item.slice("__typed__:".length));
    } else {
      pick(item);
    }
  };

  return (
    <div className="resource-filter-field-picker box grow" ref={rootRef} data-testid="field-path-picker">
      <input
        className="resource-filter-field-input"
        placeholder={placeholder}
        value={open ? query : value}
        title="Type to search. ↑/↓ moves the highlight, Enter selects it, Esc closes."
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.min(current + 1, Math.max(menuItems.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            pickHighlighted();
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <ul className="resource-filter-field-menu" role="listbox">
          {showUseTyped ? (
            <li
              role="option"
              aria-selected={highlight === 0}
              className={`resource-filter-field-use-typed${highlight === 0 ? " is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(trimmedQuery)}
            >
              Use “{trimmedQuery}”
            </li>
          ) : null}
          {visible.length === 0 && !showUseTyped ? (
            <li className="resource-filter-field-empty">No matching fields</li>
          ) : (
            visible.map((path, index) => {
              const optionIndex = showUseTyped ? index + 1 : index;
              return (
                <li
                  key={path}
                  role="option"
                  aria-selected={highlight === optionIndex}
                  className={highlight === optionIndex ? "is-active" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(path)}
                >
                  {path}
                </li>
              );
            })
          )}
          {matches.length > MAX_FIELD_SUGGESTIONS ? (
            <li className="resource-filter-field-empty">Showing first {MAX_FIELD_SUGGESTIONS} matches…</li>
          ) : null}
          {menuItems.length > 0 ? (
            <li className="resource-filter-field-empty">↑↓ highlight · Enter select · Esc close</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
