/**
 * Render smoke test: loads the BUILT renderer bundle the way the Freelens host
 * does (globalThis.FreelensExtensionApi) and renders the page with React 19.
 *
 * Requires `pnpm build` first — the test is skipped when out/ is missing.
 */

import { parse } from "yaml";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out", "renderer");
const NM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules");
let downloadMatches: (() => void) | undefined;

const stub = (name: string) => {
  const f = () => null;
  f.displayName = name;
  return f;
};

beforeAll(() => {
  const React = require(path.join(NM, "react"));

  const Button = (props: { label?: string; onClick?: () => void; "data-testid"?: string }) => {
    if (props["data-testid"] === "download-matches") {
      downloadMatches = props.onClick;
    }
    return React.createElement("button", { type: "button" }, props.label ?? "");
  };

  const WithTooltip = (props: { children?: unknown }) => props.children ?? null;

  const Select = (props: { placeholder?: string }) =>
    React.createElement("span", { className: "SelectStub" }, props.placeholder ?? "");

  vi.stubGlobal("FreelensExtensionApi", {
    React,
    ReactDom: require(path.join(NM, "react-dom")),
    ReactJsxRuntime: require(path.join(NM, "react/jsx-runtime")),
    Mobx: require(path.join(NM, "mobx")),
    MobxReact: require(path.join(NM, "mobx-react")),
    Main: { LensExtension: class LensExtension {} },
    Common: {
      Store: {
        ExtensionStore: class ExtensionStore {
          static instances = new Map();
          static getInstanceOrCreate() {
            const existing = this.instances.get(this);
            if (existing) {
              return existing;
            }
            const created = new this();
            this.instances.set(this, created);
            return created;
          }
          static getInstance() {
            return this.instances.get(this);
          }
          static createInstance() {
            return this.getInstanceOrCreate();
          }
          static resetInstance() {
            this.instances.delete(this);
          }
          loadExtension() {}
          fromStore(_data: unknown) {}
          toJSON() {
            return {};
          }
        },
      },
    },
    Renderer: {
      LensExtension: class LensExtension {},
      Component: new Proxy(
        { Button, WithTooltip, Select },
        {
          get(target, key) {
            if (typeof key !== "string") {
              return undefined;
            }
            return (target as Record<string, unknown>)[key] ?? stub(key);
          },
        },
      ),
      K8sApi: {
        apiManager: {
          getApi: (predicate: (api: unknown) => boolean) => [
            [
              "/apis/acme.example.com/v1/challenges",
              {
                kind: "Challenge",
                apiBase: "/apis/acme.example.com/v1/challenges",
                apiVersionWithGroup: "acme.example.com/v1",
                isNamespaced: true,
                apiResource: "challenges",
              },
            ],
          ].map((entry) => entry[1]).find(predicate),
          getStore: () => ({
            isLoaded: false,
            items: [],
            getTotalCount: () => 0,
            loadAll: async () => [],
          }),
        },
      },
    },
  });
});

describe.skipIf(!existsSync(OUT))("built renderer bundle", () => {
  it("exports the extension class with page and menu registrations", async () => {
    const mod = await import(path.join(OUT, "index.mjs"));
    expect(typeof mod.default).toBe("function");
    const instance = new mod.default({ manifest: { name: "test", version: "0.0.0" } });
    expect(instance.clusterPages[0].id).toBe("resource-filter");
    expect(instance.clusterPageMenus[0].id).toBe("resource-filter");
    expect(instance.clusterPageMenus[0].orderNumber).toBe(15);
  });

  it("renders the page with the filter bar and add-filter button", async () => {
    const { ResourceFilterPage } = await import(path.join(OUT, "components/resource-filter-page.mjs"));
    const React = globalThis.FreelensExtensionApi.React;
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const html = renderToString(React.createElement(ResourceFilterPage));
    expect(html).toContain("Add filter");
    expect(html).toContain("Select resource kind");
  });

  it("renders the intro hint before a kind is picked", async () => {
    const { ResourceFilterPage } = await import(path.join(OUT, "components/resource-filter-page.mjs"));
    const React = globalThis.FreelensExtensionApi.React;
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const html = renderToString(React.createElement(ResourceFilterPage));
    expect(html).toContain("Pick a resource kind above");
  });

  it.each(["yq", "jq"])("downloads the matching format for the %s command dialect", async (dialect) => {
    const { FilterBar } = await import(path.join(OUT, "components/filter-bar.mjs"));
    const { FilterStore } = await import(path.join(OUT, "filtering/filter-store.mjs"));
    const { collectFieldPaths } = await import(path.join(OUT, "filtering/field-paths.mjs"));
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const store = new FilterStore();
    store.addFilter("spec.state", "=", "ready");
    const items = [
      { metadata: { name: "alpha" }, spec: { state: "ready" } },
      { metadata: { name: "beta" }, spec: { state: "pending" } },
    ];
    const html = renderToString(globalThis.FreelensExtensionApi.React.createElement(FilterBar, {
      store, catalog: collectFieldPaths(items), listState: "ready", kindId: "example.com/v1/Widget",
      resource: { kind: "Widget", apiResource: "widgets", apiVersionWithGroup: "example.com/v1", isNamespaced: true },
      savedSets: [], outputFields: ["metadata.name"], columns: [], dialect,
      suggestionItems: items, matchCount: 1, totalCount: 2, emptyHints: [],
    }));
    expect(html).toContain(`Download matches (${dialect === "yq" ? "YAML" : "JSON"})`);
    const anchor = { href: "", download: "", click: vi.fn() };
    const originalDocument = globalThis.document;
    vi.stubGlobal("document", { createElement: () => anchor });
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      expect(downloadMatches).toBeTypeOf("function");
      downloadMatches!();
      const blob = createUrl.mock.calls[0][0] as Blob;
      expect(blob.type).toBe(dialect === "yq" ? "application/yaml" : "application/json");
      expect((dialect === "yq" ? parse(await blob.text()) : JSON.parse(await blob.text()))).toEqual([{ "metadata.name": "alpha" }]);
      expect(anchor.download).toBe(`Widget-filtered.${dialect === "yq" ? "yaml" : "json"}`);
      expect(anchor.click).toHaveBeenCalledOnce();
      expect(revokeUrl).toHaveBeenCalledWith("blob:test");
    } finally {
      vi.stubGlobal("document", originalDocument);
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it("persists one-time migration and does not restore removed favorites from another frame", async () => {
    const { UiPrefsStore } = await import(path.join(OUT, "src/common/ui-prefs-store.mjs"));
    const { hydrateUiPrefsFromStore, toggleFavoriteKind, loadFavoriteKinds, savePreviewOpen, loadPreviewOpen } = await import(path.join(OUT, "filtering/filter-storage.mjs"));
    const local = new Map<string, string>();
    const originalStorage = globalThis.localStorage;
    vi.stubGlobal("localStorage", { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) });
    try {
      const stale = JSON.stringify({ favorites: ["v1/Pod"], recent: [], previewOpen: true });
      local.set("frf:v1:ui-prefs", stale);
      const firstFrame = new UiPrefsStore();
      hydrateUiPrefsFromStore(firstFrame);
      expect(loadFavoriteKinds()).toEqual(["v1/Pod"]);
      expect(firstFrame.toJSON().localStorageMigrated).toBe(true);
      toggleFavoriteKind("v1/Pod");
      savePreviewOpen(false);
      const disk = firstFrame.toJSON();
      local.set("frf:v1:ui-prefs", stale);
      local.set("frf:v1:favorites", JSON.stringify(["v1/Pod"]));
      const secondFrame = new UiPrefsStore();
      secondFrame.fromStore(disk);
      hydrateUiPrefsFromStore(secondFrame);
      expect(loadFavoriteKinds()).toEqual([]);
      expect(loadPreviewOpen()).toBe(false);
      expect(JSON.parse(local.get("frf:v1:ui-prefs")!).favorites).toEqual([]);
    } finally {
      vi.stubGlobal("localStorage", originalStorage);
    }
  });

});

describe("ErrorBoundary", () => {
  it("renders a fallback instead of crashing the page", async () => {
    const { ErrorBoundary } = await import(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src/renderer/components/error-boundary")
    );
    const error = new Error("boom");
    const state = ErrorBoundary.getDerivedStateFromError(error);
    expect(state.error).toBe(error);

    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { error };
    const React = globalThis.FreelensExtensionApi.React ?? require(path.join(NM, "react"));
    // render the fallback output to string through React
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const html = renderToString(boundary.render() as React.ReactElement);
    expect(html).toContain("could not render");
    expect(html).toContain("boom");
  });
});
