# AGENTS.md — freelens-resource-filter-extension

## Project

freelens-resource-filter-extension is a Freelens extension that renders its own cluster page with generic field-based filtering for any Kubernetes resource kind.

## Commands

The canonical command set — build, test, pack, install — lives in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Run `pnpm verify` (type-check, build, test, pack) before considering a task complete.

## Conventions

- Bump `version` in `package.json` and add a `CHANGELOG.md` entry for every deployed change. Rebuild and repack before installing.
- Host-provided modules stay external via `build/global-externals.js`.
- MobX state uses `makeObservable` annotation maps, never decorators (source must compile under tsc, oxc, and esbuild).

## Boundaries

### Always
- Run `pnpm verify` before finishing a change.
- Add or update vitest tests with any change to `src/renderer/filtering/` logic.

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

- This branch targets Freelens 2.x; extension 0.4.0 is the last v1 release. The host globals now live on `globalThis.FreelensExtensionApi`, and React/MobX must match the v2 host.
- `update-installed.sh` refuses to run while Freelens is up. Quit the app first. It installs an unpacked development copy under the v2 application-data directory, which the host adopts at startup.
- The renderer bundle is configured under the **`preload`** key in `electron.vite.config.js`, not `renderer`. The `renderer` key expects an HTML entry. Main stays CommonJS (`out/main/index.js`); renderer output must be browser ESM (`out/renderer/index.mjs`) with no Node/Electron requirements. Both use `preserveModules`.
- `apiManager.getStore(apiBase)` lazily creates a `CustomResourceStore` for CRDs. It is a side effect. Call it from an effect, never during render.
- The render smoke test in `tests/` imports the built bundle — run `pnpm build` first, or it is skipped.
- Filtering/export code must stay kind-agnostic (no hard-coded CRD or product names in logic or test fixtures meant as product examples).
- Freelens Select hardcodes `filterOption`; custom field search must use our own combobox (`filter-bar.tsx` + `field-path-search.ts`). Prefer a native `<select>` for operators that Freelens Select would substring-confuse (`older_than` / `newer_than`).
- jq cannot parse YAML — the jq dialect must emit `kubectl -o json`.
- localStorage is per cluster frame origin; favorites/filters live under `frf:v1:*` (see `filter-storage.ts`).
