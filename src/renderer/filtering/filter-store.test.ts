import { describe, expect, it } from "vitest";
import { FilterStore } from "./filter-store";

describe("FilterStore", () => {
  it("adds and tracks active filters", () => {
    const store = new FilterStore();
    store.addFilter("spec.state", "=", "pending");
    store.addFilter("metadata.namespace", "=", "");
    expect(store.filters).toHaveLength(2);
    expect(store.activeFilters).toHaveLength(1); // empty value disables the row
    expect(store.hasFilters).toBe(true);
  });

  it("keeps exists/!exists rows active without a value", () => {
    const store = new FilterStore();
    store.addFilter("spec.state", "exists", "");
    expect(store.activeFilters).toHaveLength(1);
  });

  it("updates, removes, and clears rows", () => {
    const store = new FilterStore();
    store.addFilter("a", "=", "1");
    store.addFilter("b", "=", "2");
    store.updateFilter(store.filters[0].id, { value: "9" });
    expect(store.filters[0].value).toBe("9");
    store.removeFilter(store.filters[0].id);
    expect(store.filters).toHaveLength(1);
    store.clearFilters();
    expect(store.filters).toHaveLength(0);
    expect(store.hasFilters).toBe(false);
  });

  it("serializes to plain data", () => {
    const store = new FilterStore();
    store.addFilter("spec.state", "in", "a, b");
    expect(store.serializable).toEqual([{ field: "spec.state", operator: "in", value: "a, b" }]);
  });

  it("restores from serialized data with fresh ids", () => {
    const store = new FilterStore([{ field: "x", operator: "=", value: "y" }]);
    expect(store.filters).toHaveLength(1);
    expect(store.filters[0].field).toBe("x");
    expect(store.filters[0].id).toBeTruthy();
  });

  it("setFilters replaces all rows", () => {
    const store = new FilterStore();
    store.addFilter("old", "=", "1");
    store.setFilters([{ field: "new", operator: "!=", value: "2" }]);
    expect(store.filters).toHaveLength(1);
    expect(store.filters[0].field).toBe("new");
  });
});
