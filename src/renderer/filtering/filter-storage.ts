/**
 * Safe persistence for filters and saved filter sets, keyed per resource kind.
 *
 * localStorage may be unavailable (restricted context) or throw on quota —
 * every access is guarded and failures degrade to no persistence.
 */

import type { FieldFilter } from "./filter-engine";

const ACTIVE_PREFIX = "frf:v1:active:";
const SETS_PREFIX = "frf:v1:sets:";
const LAST_KIND_KEY = "frf:v1:last-kind";
const MAX_ROWS = 50;
const MAX_SETS = 20;

function getLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export type SerializedFilter = Omit<FieldFilter, "id">;

function isSerializedFilter(value: unknown): value is SerializedFilter {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.field === "string" && typeof candidate.operator === "string" && typeof candidate.value === "string";
}

function parseFilters(raw: string | null): SerializedFilter[] | undefined {
  if (raw == null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed.filter(isSerializedFilter).slice(0, MAX_ROWS);
  } catch {
    return undefined;
  }
}

/** Persist the active filter rows for a kind. */
export function saveActiveFilters(kindId: string, filters: SerializedFilter[]): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    const payload = JSON.stringify(filters.slice(0, MAX_ROWS));
    storage.setItem(ACTIVE_PREFIX + kindId, payload);
  } catch {
    // quota or serialization failure: persistence is best-effort
  }
}

/** Load the persisted active filter rows for a kind, if any. */
export function loadActiveFilters(kindId: string): SerializedFilter[] | undefined {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    return parseFilters(storage.getItem(ACTIVE_PREFIX + kindId));
  } catch {
    return undefined;
  }
}

export interface SavedFilterSet {
  name: string;
  filters: SerializedFilter[];
}

function parseSets(raw: string | null): SavedFilterSet[] | undefined {
  if (raw == null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed
      .filter((entry): entry is SavedFilterSet => {
        if (entry == null || typeof entry !== "object") {
          return false;
        }
        const candidate = entry as Record<string, unknown>;
        return typeof candidate.name === "string" && Array.isArray(candidate.filters);
      })
      .map((entry) => ({ name: entry.name, filters: entry.filters.filter(isSerializedFilter) }))
      .slice(0, MAX_SETS);
  } catch {
    return undefined;
  }
}

/** List saved filter sets for a kind, oldest first. */
export function loadFilterSets(kindId: string): SavedFilterSet[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }
  try {
    return parseSets(storage.getItem(SETS_PREFIX + kindId)) ?? [];
  } catch {
    return [];
  }
}

/** Add or replace a named set for a kind. Returns the updated list. */
export function saveFilterSet(kindId: string, name: string, filters: SerializedFilter[]): SavedFilterSet[] {
  const sets = loadFilterSets(kindId).filter((set) => set.name !== name);
  sets.push({ name, filters: filters.slice(0, MAX_ROWS) });
  const trimmed = sets.slice(-MAX_SETS);

  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(SETS_PREFIX + kindId, JSON.stringify(trimmed));
    } catch {
      // best-effort
    }
  }
  return trimmed;
}

/** Delete a named set for a kind. Returns the updated list. */
export function deleteFilterSet(kindId: string, name: string): SavedFilterSet[] {
  const sets = loadFilterSets(kindId).filter((set) => set.name !== name);
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(SETS_PREFIX + kindId, JSON.stringify(sets));
    } catch {
      // best-effort
    }
  }
  return sets;
}

/** Remember the last selected kind so the page reopens where the user left off. */
export function saveLastKind(kindId: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(LAST_KIND_KEY, kindId);
  } catch {
    // best-effort
  }
}

/** The last selected kind, if one was persisted. */
export function loadLastKind(): string | undefined {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    return storage.getItem(LAST_KIND_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
