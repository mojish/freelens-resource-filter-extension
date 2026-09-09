/**
 * Render smoke test: loads the BUILT renderer bundle the way the Freelens host
 * does (global.LensExtensions, global.Mobx, …) and renders the page.
 *
 * Requires `pnpm build` first — the test is skipped when out/ is missing.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out", "renderer");
const NM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules");

const stub = (name: string) => {
  const f = () => null;
  f.displayName = name;
  return f;
};

beforeAll(() => {
  const React = require(path.join(NM, "react"));

  const Button = (props: { label?: string }) => React.createElement("button", { type: "button" }, props.label ?? "");

  const WithTooltip = (props: { children?: unknown }) => props.children ?? null;

  const Select = (props: { placeholder?: string }) =>
    React.createElement("span", { className: "SelectStub" }, props.placeholder ?? "");

  vi.stubGlobal("LensExtensions", {
    Main: { LensExtension: class LensExtension {} },
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
          apis: new Map([
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
          ]),
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
  vi.stubGlobal("Mobx", require(path.join(NM, "mobx")));
  vi.stubGlobal("MobxReact", require(path.join(NM, "mobx-react")));
  vi.stubGlobal("React", React);
  vi.stubGlobal("ReactDom", require(path.join(NM, "react-dom")));
  vi.stubGlobal("ReactRouterDom", {});
  vi.stubGlobal("ReactJsxRuntime", require(path.join(NM, "react/jsx-runtime")));
});

describe.skipIf(!existsSync(OUT))("built renderer bundle", () => {
  it("exports the extension class with page and menu registrations", async () => {
    const mod = await import(path.join(OUT, "index.js"));
    expect(typeof mod.default).toBe("function");
    const instance = new mod.default({ manifest: { name: "test", version: "0.0.0" } });
    expect(instance.clusterPages[0].id).toBe("resource-filter");
    expect(instance.clusterPageMenus[0].id).toBe("resource-filter");
    expect(instance.clusterPageMenus[0].orderNumber).toBe(15);
  });

  it("renders the page with the filter bar and add-filter button", async () => {
    const { ResourceFilterPage } = await import(path.join(OUT, "components/resource-filter-page.js"));
    const React = globalThis.React;
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const html = renderToString(React.createElement(ResourceFilterPage));
    expect(html).toContain("Add filter");
    expect(html).toContain("Select resource kind");
  });

  it("renders the intro hint before a kind is picked", async () => {
    const { ResourceFilterPage } = await import(path.join(OUT, "components/resource-filter-page.js"));
    const React = globalThis.React;
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const html = renderToString(React.createElement(ResourceFilterPage));
    expect(html).toContain("Pick a resource kind above");
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
    const React = globalThis.React ?? require(path.join(NM, "react"));
    // render the fallback output to string through React
    const { renderToString } = require(path.join(NM, "react-dom/server"));
    const html = renderToString(boundary.render() as React.ReactElement);
    expect(html).toContain("could not render");
    expect(html).toContain("boom");
  });
});
