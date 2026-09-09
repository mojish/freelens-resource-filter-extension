/**
 * MobX store holding the active filter rows for the Resource Filter page.
 * Plain observable state — evaluation lives in filter-engine.ts,
 * persistence lives in filter-storage.ts.
 *
 * Uses makeObservable annotations instead of decorators so the source compiles
 * identically under tsc (type-check), oxc (build), and esbuild (vitest).
 */

import { observable, action, computed, makeObservable } from "mobx";
import { getRandomId } from "./id";
import type { FieldFilter, FilterOperator } from "./filter-engine";
import type { SerializedFilter } from "./filter-storage";

export class FilterStore {
  filters: FieldFilter[] = [];

  constructor(initial?: SerializedFilter[]) {
    makeObservable(this, {
      filters: observable,
      activeFilters: computed,
      hasFilters: computed,
      serializable: computed,
      addFilter: action,
      updateFilter: action,
      removeFilter: action,
      clearFilters: action,
      setFilters: action,
    });
    if (initial) {
      this.filters = initial.map((filter) => ({ id: getRandomId(), ...filter }));
    }
  }

  get activeFilters(): FieldFilter[] {
    return this.filters.filter(({ operator, value }) => operator === "exists" || operator === "!exists" || value !== "");
  }

  get hasFilters(): boolean {
    return this.activeFilters.length > 0;
  }

  /** Plain-data copy for persistence. */
  get serializable(): SerializedFilter[] {
    return this.filters.map(({ field, operator, value }) => ({ field, operator, value }));
  }

  addFilter(field = "", operator: FilterOperator = "=", value = ""): void {
    this.filters.push({ id: getRandomId(), field, operator, value });
  }

  updateFilter(id: string, patch: Partial<Omit<FieldFilter, "id">>): void {
    const filter = this.filters.find((f) => f.id === id);
    if (filter) {
      Object.assign(filter, patch);
    }
  }

  removeFilter(id: string): void {
    this.filters = this.filters.filter((f) => f.id !== id);
  }

  clearFilters(): void {
    this.filters = [];
  }

  /** Replace all rows (used when restoring persisted filters or loading a saved set). */
  setFilters(filters: SerializedFilter[]): void {
    this.filters = filters.map((filter) => ({ id: getRandomId(), ...filter }));
  }
}
