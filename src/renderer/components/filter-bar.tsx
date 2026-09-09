/**
 * FilterBar: the generic field-based filter UI.
 *
 * Rows of: Field (Select with search over discovered field paths) ×
 * Operator (Select) × Value (input with datalist suggestions) + remove button.
 * "+ Add filter" appends a row. All rows are ANDed.
 */

import * as MobxReact from "mobx-react";
import { Renderer } from "@freelensapp/extensions";
import { filterOperators, type FieldFilter, type FilterOperator } from "../filtering/filter-engine";
import type { FilterStore } from "../filtering/filter-store";
import { fieldPathsOf, valueSuggestionsFor, type FieldCatalog } from "../filtering/field-paths";

const { observer } = MobxReact;

const {
  Component: { Select, Button, Icon },
} = Renderer;

type StringOption = { value: string; label: string };

export interface FilterBarProps {
  store: FilterStore;
  catalog: FieldCatalog;
}

export const FilterBar = observer(({ store, catalog }: FilterBarProps) => {
  const paths = fieldPathsOf(catalog);

  return (
    <div className="resource-filter-bar flex column gaps" data-testid="resource-filter-bar">
      {store.filters.map((filter) => (
        <FilterRow key={filter.id} filter={filter} store={store} paths={paths} catalog={catalog} />
      ))}

      <div className="flex gaps align-center">
        <Button primary label="Add filter" onClick={() => store.addFilter()} />
        {store.hasFilters && <Button label="Clear all" onClick={() => store.clearFilters()} />}
      </div>
    </div>
  );
});

interface FilterRowProps {
  filter: FieldFilter;
  store: FilterStore;
  paths: string[];
  catalog: FieldCatalog;
}

const FilterRow = observer(({ filter, store, paths, catalog }: FilterRowProps) => {
  const suggestions = valueSuggestionsFor(catalog, filter.field);
  const needsValue = filter.operator !== "exists" && filter.operator !== "!exists";

  const fieldOptions: StringOption[] = paths.map((path) => ({ value: path, label: path }));
  const operatorOptions: StringOption[] = filterOperators.map((op) => ({ value: op, label: op }));

  return (
    <div className="flex gaps align-center" data-testid="resource-filter-row">
      <Select
        className="resource-filter-field box grow"
        placeholder={paths.length > 0 ? "Field (type to search…)" : "Field (pick a resource kind first)"}
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
            placeholder={suggestions.length > 0 ? `e.g. ${suggestions[0]}` : "Value"}
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

      <Icon material="close" title="Remove filter" onClick={() => store.removeFilter(filter.id)} />
    </div>
  );
});
