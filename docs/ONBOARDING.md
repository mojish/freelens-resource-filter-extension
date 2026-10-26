# Onboarding — freelens-resource-filter-extension

## What is this project?

A [Freelens](https://freelens.app) extension. It adds one cluster page, **Resource Filter**, that lists any Kubernetes resource kind (built-in or CRD) and filters it by field paths. Engineers use it to slice large lists — for example thousands of certificates or pending Challenges — with field operators, OR groups, and a copy-pasteable `kubectl | yq` / `jq` command. It runs inside the Freelens desktop app as an installed extension.

## Tech stack

| Concern | Technology |
|---|---|
| UI runtime | Host-provided React 17 and MobX, consumed as globals — never bundled |
| Bundler | electron-vite with `preserveModules`, CommonJS output |
| Package manager | pnpm through corepack |

## Repository layout

```
freelens-resource-filter-extension/
├── build/                  # global-externals plugin: maps host modules to globals
├── src/main/               # main-process durable preferences activation
├── src/renderer/
│   ├── index.tsx           # page + sidebar menu registration
│   ├── components/         # ResourceFilterPage, FilterBar, ErrorBoundary, styles
│   ├── discovery/          # resource-kind discovery via apiManager
│   └── filtering/          # engine, paths, kubectl export, store, persistence, tests
├── tests/                  # built-renderer, browser, and updater regressions
├── docs/                   # this documentation set
└── update-installed.sh     # deploy helper for the local Freelens profile
```

## First steps

1. Install pnpm through corepack: `corepack enable pnpm && corepack prepare pnpm@10.34.4 --activate`
2. Install dependencies: `pnpm install`
3. Type-check and build: `pnpm type:check && pnpm build`
4. Run the tests: `pnpm test`
5. Pack a tarball: `pnpm pack`
6. Install into Freelens: quit Freelens, then `./update-installed.sh` (or drag the `*.tgz` onto Extensions). If the enable/disable loop appears, restart Freelens — known host bug.
7. First code to read: `src/renderer/index.tsx` (registration), `src/renderer/components/resource-filter-page.tsx` (the page), `src/renderer/filtering/filter-engine.ts` (operator + OR-group semantics).

## Where to find things when lost

| Question | Where to look |
|---|---|
| Why is my filter row ignored? | Operator / empty-value rules in `filter-engine.ts`; invalid-duration rules; missing catalog paths still apply |
| How do AND / OR rows combine? | `groupFiltersByCombinator` / `createFilterMatcher` in `filter-engine.ts` |
| Why is the field dropdown empty? | `field-paths.ts` (needs loaded items); search ranking in `field-path-search.ts` |
| Why does kubectl\|jq fail on YAML? | jq dialect must use `-o json` — see `kubectl-yq.ts` |
| Why does download include other namespaces? | `namespace-scope.ts` + Freelens namespace picker (fixed in 0.3.2+) |
| Where do filters / favorites persist? | Filters/sets: cluster-frame localStorage (`filter-storage.ts`). Favorites/recent: Freelens ExtensionStore after one-time localStorage migration (`src/common/ui-prefs-store.ts`) |
| Where does the kind list come from? | `discovery/api-discovery.ts` |
| The page does not render. What now? | `~/.config/Freelens/logs/lens-renderer-cluster-*-frame.log` |
| How do I deploy a code change locally? | Run `pnpm verify`, quit Freelens, then `./update-installed.sh` |

## Companion documents

| File | Covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How it works and why |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Build, pack, install, debug how-tos |
| [AGENTS.md](../AGENTS.md) | Instructions for AI coding agents |

Decisions and their rationale live in the `delivery/madr` repository — link, never restate.
