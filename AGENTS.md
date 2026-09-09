# AGENTS.md — freelens-resource-filter-extension

## Project

freelens-resource-filter-extension is a Freelens extension that renders its own cluster page with generic field-based filtering for any Kubernetes resource kind.

## Commands

The canonical command set — build, pack, install — lives in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Run `pnpm type:check && pnpm build` before considering a task complete.

## Conventions

- Bump `version` in `package.json` for every code change that is deployed. Rebuild and repack before installing.
- Mirror the build setup of `freelensapp/freelens-example-extension`. Host-provided modules stay external via `build/global-externals.js`.

## Boundaries

### Always
- Run `pnpm type:check` and `pnpm build` before finishing a change.

### Ask first
- Adding or removing npm dependencies.
- Changing the Freelens extension API surface in use (registrations, `Renderer.Component` usage).

### Never
- Never bundle `@freelensapp/extensions`, `react`, `react-dom`, `mobx`, `mobx-react`, or `react-router-dom`. The host provides them as globals.
- Never edit anything under `out/` or `node_modules/`. Both are generated.
- Never touch `~/.freelens/extensions/` or `~/.config/Freelens/` while Freelens is running.

## Docs

- `docs/ONBOARDING.md` — getting started, repo map
- `docs/ARCHITECTURE.md` — how it works and why
- `docs/DEVELOPMENT.md` — build, pack, install, debug how-tos
- Decisions live in the `delivery/madr` repository, not here

## Gotchas

- Installing a `*.tgz` while Freelens runs can trigger the host's enable/disable loop ([freelens#1005](https://github.com/freelensapp/freelens/issues/1005)). It settles by itself. Restart the app and the extension is installed.
- `update-installed.sh` refuses to run while Freelens is up. Quit the app first.
- The renderer bundle is configured under the **`preload`** key in `electron.vite.config.js`, not `renderer`. The `renderer` key expects an HTML entry. Output must stay CommonJS with `preserveModules`, because Freelens loads `out/main/index.js` and `out/renderer/index.js` directly.
- `apiManager.getStore(apiBase)` lazily creates a `CustomResourceStore` for CRDs. It is a side effect. Call it from an effect, never during render.
