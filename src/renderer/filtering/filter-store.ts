/**
 * MobX store holding the active filter rows for the Resource Filter page.
 */

import { observable, action, computed, makeObservable } from "mobx";
import { getRandomId } from "./id";
import type { FieldFilter, FilterCombinator, FilterOperator } from "./filter-engine";
import type { SerializedFilter } from "./filter-storage";

export class FilterStore {
  filters: FieldFilter[] = [];
  /** Bumped on every mutation so React/MobX UIs can key off a primitive. */
  revision = 0;

  constructor(initial?: SerializedFilter[]) {
    makeObservable(this, {
      filters: observable.deep,
      revision: observable,
      activeFilters: computed,
      hasFilters: computed,
      serializable: computed,
      /** Signature including combinators — invalidates match counts when AND/OR flips. */
      matchSignature: computed,
      addFilter: action,
      updateFilter: action,
      removeFilter: action,
      clearFilters: action,
      setFilters: action,
    });
    if (initial) {
      this.filters = initial.map((filter) => ({
        id: getRandomId(),
        combinator: "and" as FilterCombinator,
        ...filter,
      }));
    }
  }

  get activeFilters(): FieldFilter[] {
    return this.filters.filter((filter) => {
      // Read combinator so AND/OR toggles invalidate dependents (preview, N/M).
      void filter.combinator;
      return (
        filter.field !== "" &&
        (filter.operator === "exists" || filter.operator === "!exists" || filter.value !== "")
      );
    });
  }

  get matchSignature(): string {
    return this.filters
      .map(
        (filter) =>
          `${filter.id}\0${filter.field}\0${filter.operator}\0${filter.value}\0${filter.combinator ?? "and"}`,
      )
      .join("\n");
  }

  get hasFilters(): boolean {
    return this.activeFilters.length > 0;
  }

  get serializable(): SerializedFilter[] {
    return this.filters.map(({ field, operator, value, combinator }) => ({
      field,
      operator,
      value,
      combinator: combinator ?? "and",
    }));
  }

  private bump(): void {
    this.revision += 1;
  }

  addFilter(field = "", operator: FilterOperator = "=", value = "", combinator: FilterCombinator = "and"): void {
    this.filters.push({ id: getRandomId(), field, operator, value, combinator });
    this.bump();
  }

  updateFilter(id: string, patch: Partial<Omit<FieldFilter, "id">>): void {
    const filter = this.filters.find((f) => f.id === id);
    if (filter) {
      Object.assign(filter, patch);
      this.bump();
    }
  }

  removeFilter(id: string): void {
    this.filters = this.filters.filter((f) => f.id !== id);
    this.bump();
  }

  clearFilters(): void {
    this.filters = [];
    this.bump();
  }

  setFilters(filters: SerializedFilter[]): void {
    this.filters = filters.map((filter) => ({
      id: getRandomId(),
      combinator: "and" as FilterCombinator,
      ...filter,
    }));
    this.bump();
  }
}
