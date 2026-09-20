/**
 * Safe persistence for filters, saved sets, session UI prefs, favorites, and recent kinds.
 *
 * localStorage may be unavailable (restricted context) or throw on quota —
 * every access is guarded and failures degrade to no persistence.
 */

import type { FieldFilter, FilterCombinator, FilterOperator } from "./filter-engine";
import type { KubectlDialect } from "./kubectl-yq";

const ACTIVE_PREFIX = "frf:v1:active:";
const SETS_PREFIX = "frf:v1:sets:";
const SESSION_PREFIX = "frf:v1:session:";
const LAST_KIND_KEY = "frf:v1:last-kind";
/** Single atomic blob for favorites / recent / UI chrome (survives better than many keys). */
const UI_PREFS_KEY = "frf:v1:ui-prefs";
const FAVORITES_KEY = "frf:v1:favorites";
const RECENT_KEY = "frf:v1:recent";
const MAX_ROWS = 50;
const MAX_SETS = 20;
const MAX_RECENT = 12;

function getLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export type SerializedFilter = Omit<FieldFilter, "id">;

export interface KindSession {
  outputFields: string[];
  columns: string[];
  dialect: KubectlDialect;
}

export interface UiPrefs {
  favorites: string[];
  recent: string[];
  /** Whether the live kubectl command panel is expanded. */
  previewOpen: boolean;
}

const DEFAULT_UI_PREFS: UiPrefs = {
  favorites: [],
  recent: [],
  previewOpen: false,
};

/** Set by renderer onActivate once ExtensionStore is loaded. */
type UiPrefsStoreLike = {
  favorites: string[];
  recent: string[];
  previewOpen: boolean;
  setFavorites: (ids: string[]) => void;
  setRecent: (ids: string[]) => void;
  toggleFavorite: (kindId: string) => string[];
  pushRecent: (kindId: string) => void;
  setPreviewOpen: (open: boolean) => void;
  toJSON: () => UiPrefs;
};

let extensionUiPrefs: UiPrefsStoreLike | null = null;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

function readLocalStorageUiPrefs(): UiPrefs {
  const storage = getLocalStorage();
  if (!storage) {
    return { ...DEFAULT_UI_PREFS, favorites: [], recent: [] };
  }
  try {
    const raw = storage.getItem(UI_PREFS_KEY);
    let favorites: string[] = [];
    let recent: string[] = [];
    let previewOpen = false;
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const candidate = parsed as Record<string, unknown>;
        favorites = parseStringArray(candidate.favorites);
        recent = parseStringArray(candidate.recent).slice(0, MAX_RECENT);
        previewOpen = candidate.previewOpen === true;
      }
    }
    // Always merge legacy keys so an empty blob cannot hide older favorites.
    favorites = uniqueIds([...favorites, ...loadStringList(FAVORITES_KEY)]);
    recent = uniqueIds([...recent, ...loadStringList(RECENT_KEY)]).slice(0, MAX_RECENT);
    const prefs = { favorites, recent, previewOpen };
    // Materialize a ui-prefs blob when only legacy keys exist.
    if ((favorites.length > 0 || recent.length > 0) && storage.getItem(UI_PREFS_KEY) == null) {
      writeLocalStorageUiPrefs(prefs);
    }
    return prefs;
  } catch {
    return { ...DEFAULT_UI_PREFS, favorites: [], recent: [] };
  }
}

function writeLocalStorageUiPrefs(prefs: UiPrefs): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  const payload: UiPrefs = {
    favorites: prefs.favorites.slice(0, MAX_ROWS),
    recent: prefs.recent.slice(0, MAX_RECENT),
    previewOpen: prefs.previewOpen === true,
  };
  try {
    storage.setItem(UI_PREFS_KEY, JSON.stringify(payload));
    storage.setItem(FAVORITES_KEY, JSON.stringify(payload.favorites));
    storage.setItem(RECENT_KEY, JSON.stringify(payload.recent));
  } catch {
    // best-effort
  }
}

/**
 * Wire Freelens ExtensionStore after onActivate. Merges any localStorage
 * leftovers into the store so upgrades / force-quit recovery keep favorites.
 */
export function hydrateUiPrefsFromStore(store: UiPrefsStoreLike): void {
  extensionUiPrefs = store;
  const fromLs = readLocalStorageUiPrefs();
  const mergedFavorites = uniqueIds([...store.favorites, ...fromLs.favorites]);
  const recent =
    store.recent.length > 0
      ? uniqueIds([...store.recent, ...fromLs.recent]).slice(0, MAX_RECENT)
      : uniqueIds([...fromLs.recent]).slice(0, MAX_RECENT);
  const previewOpen = store.previewOpen || fromLs.previewOpen;
  store.setFavorites(mergedFavorites);
  store.setRecent(recent);
  store.setPreviewOpen(previewOpen);
  writeLocalStorageUiPrefs(store.toJSON());
}

function loadUiPrefs(): UiPrefs {
  if (extensionUiPrefs) {
    return extensionUiPrefs.toJSON();
  }
  return readLocalStorageUiPrefs();
}

function saveUiPrefs(prefs: UiPrefs): void {
  if (extensionUiPrefs) {
    extensionUiPrefs.setFavorites(prefs.favorites);
    extensionUiPrefs.setRecent(prefs.recent);
    extensionUiPrefs.setPreviewOpen(prefs.previewOpen);
    writeLocalStorageUiPrefs(extensionUiPrefs.toJSON());
    return;
  }
  writeLocalStorageUiPrefs(prefs);
}

export interface SavedFilterSet {
  name: string;
  filters: SerializedFilter[];
  outputFields?: string[];
  columns?: string[];
}

function isSerializedFilter(value: unknown): value is SerializedFilter {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.field !== "string" ||
    typeof candidate.operator !== "string" ||
    typeof candidate.value !== "string"
  ) {
    return false;
  }
  if (
    candidate.combinator !== undefined &&
    candidate.combinator !== "and" &&
    candidate.combinator !== "or"
  ) {
    return false;
  }
  return true;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").slice(0, MAX_ROWS);
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
    storage.setItem(ACTIVE_PREFIX + kindId, JSON.stringify(filters.slice(0, MAX_ROWS)));
  } catch {
    // best-effort
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
      .filter((entry): entry is Record<string, unknown> => entry != null && typeof entry === "object")
      .filter((entry) => typeof entry.name === "string" && Array.isArray(entry.filters))
      .map((entry) => ({
        name: entry.name as string,
        filters: (entry.filters as unknown[]).filter(isSerializedFilter),
        outputFields: parseStringArray(entry.outputFields),
        columns: parseStringArray(entry.columns),
      }))
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

export interface SaveFilterSetExtras {
  outputFields?: string[];
  columns?: string[];
}

/** Add or replace a named set for a kind. Returns the updated list. */
export function saveFilterSet(
  kindId: string,
  name: string,
  filters: SerializedFilter[],
  extras: SaveFilterSetExtras = {},
): SavedFilterSet[] {
  const sets = loadFilterSets(kindId).filter((set) => set.name !== name);
  sets.push({
    name,
    filters: filters.slice(0, MAX_ROWS),
    outputFields: (extras.outputFields ?? []).slice(0, MAX_ROWS),
    columns: (extras.columns ?? []).slice(0, MAX_ROWS),
  });
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

/** Export all saved sets for a kind as JSON text. */
export function exportFilterSetsJson(kindId: string): string {
  return JSON.stringify({ kindId, sets: loadFilterSets(kindId) }, null, 2);
}

/** Import sets from JSON previously produced by exportFilterSetsJson (merge by name). */
export function importFilterSetsJson(kindId: string, json: string): SavedFilterSet[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed == null || typeof parsed !== "object") {
      return loadFilterSets(kindId);
    }
    const candidate = parsed as Record<string, unknown>;
    const incoming = Array.isArray(candidate.sets) ? candidate.sets : Array.isArray(parsed) ? parsed : [];
    let sets = loadFilterSets(kindId);
    for (const entry of incoming) {
      if (entry == null || typeof entry !== "object") {
        continue;
      }
      const row = entry as Record<string, unknown>;
      if (typeof row.name !== "string" || !Array.isArray(row.filters)) {
        continue;
      }
      sets = saveFilterSet(kindId, row.name, (row.filters as unknown[]).filter(isSerializedFilter), {
        outputFields: parseStringArray(row.outputFields),
        columns: parseStringArray(row.columns),
      });
    }
    return sets;
  } catch {
    return loadFilterSets(kindId);
  }
}

const DEFAULT_SESSION: KindSession = {
  outputFields: [],
  columns: [],
  dialect: "yq",
};

export function saveKindSession(kindId: string, session: KindSession): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SESSION_PREFIX + kindId, JSON.stringify(session));
  } catch {
    // best-effort
  }
}

export function loadKindSession(kindId: string): KindSession {
  const storage = getLocalStorage();
  if (!storage) {
    return { ...DEFAULT_SESSION };
  }
  try {
    const raw = storage.getItem(SESSION_PREFIX + kindId);
    if (raw == null) {
      return { ...DEFAULT_SESSION };
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") {
      return { ...DEFAULT_SESSION };
    }
    const candidate = parsed as Record<string, unknown>;
    const dialect = candidate.dialect === "jq" ? "jq" : "yq";
    return {
      outputFields: parseStringArray(candidate.outputFields),
      columns: parseStringArray(candidate.columns),
      dialect,
    };
  } catch {
    return { ...DEFAULT_SESSION };
  }
}

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

function loadStringList(key: string): string[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(key);
    if (raw == null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return parseStringArray(parsed);
  } catch {
    return [];
  }
}

export function loadFavoriteKinds(): string[] {
  return loadUiPrefs().favorites;
}

/** Toggle a kind in favorites; returns the new list. */
export function toggleFavoriteKind(kindId: string): string[] {
  if (extensionUiPrefs) {
    const next = extensionUiPrefs.toggleFavorite(kindId);
    writeLocalStorageUiPrefs(extensionUiPrefs.toJSON());
    return next;
  }
  const prefs = loadUiPrefs();
  const favorites = prefs.favorites.includes(kindId)
    ? prefs.favorites.filter((id) => id !== kindId)
    : [...prefs.favorites, kindId];
  saveUiPrefs({ ...prefs, favorites });
  return favorites;
}

export function loadRecentKinds(): string[] {
  return loadUiPrefs().recent;
}

/** Push a kind to the front of the recent list. */
export function saveRecentKind(kindId: string): void {
  if (extensionUiPrefs) {
    extensionUiPrefs.pushRecent(kindId);
    writeLocalStorageUiPrefs(extensionUiPrefs.toJSON());
    return;
  }
  const prefs = loadUiPrefs();
  const recent = [kindId, ...prefs.recent.filter((id) => id !== kindId)].slice(0, MAX_RECENT);
  saveUiPrefs({ ...prefs, recent });
}

export function loadPreviewOpen(): boolean {
  return loadUiPrefs().previewOpen;
}

export function savePreviewOpen(open: boolean): void {
  if (extensionUiPrefs) {
    extensionUiPrefs.setPreviewOpen(open);
    writeLocalStorageUiPrefs(extensionUiPrefs.toJSON());
    return;
  }
  const prefs = loadUiPrefs();
  saveUiPrefs({ ...prefs, previewOpen: open });
}

/** Re-read favorites+recent (ExtensionStore first, else localStorage). */
export function loadUiChrome(): Pick<UiPrefs, "favorites" | "recent"> {
  const prefs = loadUiPrefs();
  return { favorites: prefs.favorites, recent: prefs.recent };
}

/** Normalize legacy rows that lack combinator. */
export function withDefaultCombinator(
  filters: Array<{ field: string; operator: FilterOperator | string; value: string; combinator?: FilterCombinator }>,
): SerializedFilter[] {
  return filters.map((filter) => ({
    field: filter.field,
    operator: filter.operator as FilterOperator,
    value: filter.value,
    combinator: filter.combinator ?? "and",
  }));
}
