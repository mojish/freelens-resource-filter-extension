/**
 * FilterBar: the generic field-based filter UI.
 *
 * Rows of: Field (Select with search over discovered field paths) ×
 * Operator (Select) × Value (input with datalist suggestions) + remove button.
 * "+ Add filter" appends a row. All rows are ANDed.
 *
 * Rows whose field is not present in the current kind's catalog are marked
 * stale (warning icon + red border) and skipped when filtering.
 * Named filter sets can be saved, loaded, and deleted per resource kind.
 */

import React from "react";
import * as MobxReact from "mobx-react";
import { Renderer } from "@freelensapp/extensions";
import { filterOperators, type FieldFilter, type FilterOperator } from "../filtering/filter-engine";
import type { FilterStore } from "../filtering/filter-store";
import { fieldPathsOf, valueSuggestionsFor, type FieldCatalog } from "../filtering/field-paths";
import type { SavedFilterSet } from "../filtering/filter-storage";

const { observer } = MobxReact;

const {
  Component: { Select, Button, Icon },
} = Renderer;

type StringOption = { value: string; label: string };

/** Coarse state of the underlying item list, drives placeholders. */
export type ListState = "no-kind" | "loading" | "empty" | "ready";

export interface FilterBarProps {
  store: FilterStore;
  catalog: FieldCatalog;
  listState: ListState;
  /** Current resource kind id, or null before a kind is picked. */
  kindId: string | null;
  savedSets: SavedFilterSet[];
  onSaveSet: (name: string) => void;
  onLoadSet: (name: string) => void;
  onDeleteSet: (name: string) => void;
}

const fieldPlaceholderByState: Record<ListState, string> = {
  "no-kind": "Field (pick a resource kind first)",
  loading: "Field (loading items…)",
  empty: "Field (this kind has no items)",
  ready: "Field (type to search…)",
};

const valuePlaceholderByOperator: Partial<Record<FilterOperator, string>> = {
  in: "value1, value2, …",
  regex: "^pending$",
};

export const FilterBar = observer(
  ({ store, catalog, listState, kindId, savedSets, onSaveSet, onLoadSet, onDeleteSet }: FilterBarProps) => {
    const paths = fieldPathsOf(catalog);
    const [setName, setSetName] = React.useState("");
    const [activeSetName, setActiveSetName] = React.useState<string | undefined>(undefined);

    const setOptions: StringOption[] = savedSets.map((set) => ({ value: set.name, label: set.name }));

    const saveCurrentSet = (): void => {
      const name = setName.trim();
      if (!kindId || !name) {
        return;
      }
      onSaveSet(name);
      setSetName("");
      setActiveSetName(name);
    };

    return (
      <div className="resource-filter-bar flex column gaps" data-testid="resource-filter-bar">
        {store.filters.map((filter) => (
          <FilterRow
            key={filter.id}
            filter={filter}
            store={store}
            paths={paths}
            catalog={catalog}
            listState={listState}
          />
        ))}

        <div className="flex gaps align-center">
          <Button primary label="Add filter" onClick={() => store.addFilter()} data-testid="add-filter" />
          {store.hasFilters && <Button label="Clear all" onClick={() => store.clearFilters()} />}

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
      </div>
    );
  },
);

interface FilterRowProps {
  filter: FieldFilter;
  store: FilterStore;
  paths: string[];
  catalog: FieldCatalog;
  listState: ListState;
}

const FilterRow = observer(({ filter, store, paths, catalog, listState }: FilterRowProps) => {
  const suggestions = valueSuggestionsFor(catalog, filter.field);
  const needsValue = filter.operator !== "exists" && filter.operator !== "!exists";
  const stale = filter.field !== "" && paths.length > 0 && !paths.includes(filter.field);

  const fieldOptions: StringOption[] = paths.map((path) => ({ value: path, label: path }));
  const operatorOptions: StringOption[] = filterOperators.map((op) => ({ value: op, label: op }));

  return (
    <div
      className={`flex gaps align-center${stale ? " resource-filter-row-stale" : ""}`}
      data-testid="resource-filter-row"
    >
      <Select
        className="resource-filter-field box grow"
        placeholder={fieldPlaceholderByState[listState]}
        value={filter.field}
        options={fieldOptions}
        isSearchable
        onChange={(option: StringOption | null) => {
          if (option) {
            store.updateFilter(filter.id, { field: option.value, value: "" });
          }
        }}
      />

      <Select
        className="resource-filter-operator"
        placeholder="="
        value={filter.operator as string}
        options={operatorOptions}
        onChange={(option: StringOption | null) => {
          if (option) {
            store.updateFilter(filter.id, { operator: option.value as FilterOperator });
          }
        }}
      />

      {needsValue ? (
        <>
          <input
            className="resource-filter-value box grow"
            list={`resource-filter-suggestions-${filter.id}`}
            placeholder={valuePlaceholderByOperator[filter.operator] ?? (suggestions.length > 0 ? `e.g. ${suggestions[0]}` : "Value")}
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
        <Icon material="warning" title="Field is not present in this kind — this row is ignored" className="resource-filter-stale-icon" />
      ) : null}

      <Icon material="close" title="Remove filter" onClick={() => store.removeFilter(filter.id)} />
    </div>
  );
});
