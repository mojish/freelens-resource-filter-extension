/**
 * Durable UI prefs (favorites, recent kinds, preview open) via Freelens ExtensionStore.
 *
 * Electron localStorage is memory-first and can lose the last writes on force-quit.
 * ExtensionStore persists under ~/.config/Freelens/ (extension store files).
 *
 * No MobX decorators — makeObservable only (tsc / oxc / esbuild).
 */

import { Common } from "@freelensapp/extensions";
import { makeObservable, observable, action } from "mobx";

export interface UiPrefsModel {
  favorites: string[];
  recent: string[];
  previewOpen: boolean;
  localStorageMigrated: boolean;
}

const MAX_RECENT = 12;

export class UiPrefsStore extends Common.Store.ExtensionStore<UiPrefsModel> {
  favorites: string[] = [];
  recent: string[] = [];
  previewOpen = false;
  localStorageMigrated = false;

  constructor() {
    super({
      configName: "resource-filter-ui-prefs",
      defaults: {
        favorites: [],
        recent: [],
        previewOpen: false,
        localStorageMigrated: false,
      },
    });
    makeObservable(this, {
      favorites: observable,
      recent: observable,
      previewOpen: observable,
      localStorageMigrated: observable,
      markLocalStorageMigrated: action,
      fromStore: action,
      setFavorites: action,
      setRecent: action,
      toggleFavorite: action,
      pushRecent: action,
      setPreviewOpen: action,
    });
  }

  fromStore(data: Partial<UiPrefsModel>): void {
    this.favorites = Array.isArray(data.favorites)
      ? data.favorites.filter((id): id is string => typeof id === "string")
      : [];
    this.recent = Array.isArray(data.recent)
      ? data.recent.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT)
      : [];
    this.previewOpen = data.previewOpen === true;
    this.localStorageMigrated = data.localStorageMigrated === true;
  }

  toJSON(): UiPrefsModel {
    return {
      favorites: this.favorites.slice(),
      recent: this.recent.slice(0, MAX_RECENT),
      previewOpen: this.previewOpen === true,
      localStorageMigrated: this.localStorageMigrated,
    };
  }

  markLocalStorageMigrated(): void {
    this.localStorageMigrated = true;
  }

  setFavorites(ids: string[]): void {
    this.favorites = [...new Set(ids.filter((id) => id.length > 0))];
  }

  setRecent(ids: string[]): void {
    this.recent = [...new Set(ids.filter((id) => id.length > 0))].slice(0, MAX_RECENT);
  }

  toggleFavorite(kindId: string): string[] {
    if (this.favorites.includes(kindId)) {
      this.favorites = this.favorites.filter((id) => id !== kindId);
    } else {
      this.favorites = [...this.favorites, kindId];
    }
    return this.favorites.slice();
  }

  pushRecent(kindId: string): void {
    this.recent = [kindId, ...this.recent.filter((id) => id !== kindId)].slice(0, MAX_RECENT);
  }

  setPreviewOpen(open: boolean): void {
    this.previewOpen = open;
  }
}
