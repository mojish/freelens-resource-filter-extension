/**
 * MobX store holding the active filter rows for the Resource Filter page.
 * Plain observable state — evaluation lives in filter-engine.ts.
 */

import { observable, action, computed, makeObservable } from "mobx";
import { getRandomId } from "./id";
import { matchesAllFilters, type FieldFilter, type FilterOperator } from "./filter-engine";

export class FilterStore {
  @observable filters: FieldFilter[] = [];

  @observable expanded = true;

  constructor() {
    makeObservable(this);
  }

  @computed get activeFilters(): FieldFilter[] {
    return this.filters.filter(({ operator, value }) => operator === "exists" || operator === "!exists" || value !== "");
  }

  @computed get hasFilters(): boolean {
    return this.activeFilters.length > 0;
  }

  matches(item: object): boolean {
    return matchesAllFilters(item, this.activeFilters);
  }

  @action
  addFilter(field = "", operator: FilterOperator = "=", value = ""): void {
    this.filters.push({ id: getRandomId(), field, operator, value });
  }

  @action
  updateFilter(id: string, patch: Partial<Omit<FieldFilter, "id">>): void {
    const filter = this.filters.find((f) => f.id === id);
    if (filter) {
      Object.assign(filter, patch);
    }
  }

  @action
  removeFilter(id: string): void {
    this.filters = this.filters.filter((f) => f.id !== id);
  }

  @action
  clearFilters(): void {
    this.filters = [];
  }

  @action
  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  @action
  updateExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }
}
