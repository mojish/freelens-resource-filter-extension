import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFilterSet,
  loadActiveFilters,
  loadFilterSets,
  loadLastKind,
  saveActiveFilters,
  saveFilterSet,
  saveLastKind,
  type SerializedFilter,
} from "./filter-storage";

class FakeStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const rows: SerializedFilter[] = [
  { field: "spec.state", operator: "=", value: "pending" },
  { field: "metadata.namespace", operator: "in", value: "a, b" },
];

describe("filter-storage", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips active filters per kind", () => {
    saveActiveFilters("v1/Challenge", rows);
    expect(loadActiveFilters("v1/Challenge")).toEqual(rows);
    expect(loadActiveFilters("v1/Certificate")).toBeUndefined();
  });

  it("ignores corrupted persisted rows", () => {
    storage.setItem("frf:v1:active:v1/Challenge", JSON.stringify([{ nope: 1 }, rows[0], "junk"]));
    expect(loadActiveFilters("v1/Challenge")).toEqual([rows[0]]);
  });

  it("returns undefined for non-array payloads", () => {
    storage.setItem("frf:v1:active:v1/Challenge", '{"field":"a"}');
    expect(loadActiveFilters("v1/Challenge")).toBeUndefined();
  });

  it("saves, lists, and deletes named sets per kind", () => {
    saveFilterSet("v1/Challenge", "pending-only", rows);
    saveFilterSet("v1/Challenge", "namespaced", [rows[1]]);

    let sets = loadFilterSets("v1/Challenge");
    expect(sets.map((s) => s.name)).toEqual(["pending-only", "namespaced"]);

    // same name replaces, keeps position at the end
    saveFilterSet("v1/Challenge", "pending-only", [rows[1]]);
    sets = loadFilterSets("v1/Challenge");
    expect(sets.map((s) => s.name)).toEqual(["namespaced", "pending-only"]);

    sets = deleteFilterSet("v1/Challenge", "namespaced");
    expect(sets.map((s) => s.name)).toEqual(["pending-only"]);
    expect(loadFilterSets("v1/Certificate")).toEqual([]);
  });

  it("scopes sets per kind", () => {
    saveFilterSet("v1/Challenge", "mine", rows);
    expect(loadFilterSets("v1/Certificate")).toEqual([]);
  });

  it("remembers the last kind", () => {
    expect(loadLastKind()).toBeUndefined();
    saveLastKind("v1/Challenge");
    expect(loadLastKind()).toBe("v1/Challenge");
  });

  it("tolerates a missing localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveActiveFilters("k", rows)).not.toThrow();
    expect(loadActiveFilters("k")).toBeUndefined();
    expect(loadFilterSets("k")).toEqual([]);
    expect(loadLastKind()).toBeUndefined();
  });

  it("caps persisted rows", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ field: `f${i}`, operator: "=" as const, value: "v" }));
    saveActiveFilters("k", many);
    expect(loadActiveFilters("k")).toHaveLength(50);
  });
});
