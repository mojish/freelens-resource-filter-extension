# Onboarding — freelens-resource-filter-extension

## What is this project?

A [Freelens](https://freelens.app) extension for the delivery team. It adds one cluster page, "Resource Filter", that lists any Kubernetes resource kind and filters it by field paths. NOC and delivery engineers use it to slice large CRD lists, for example 5,000+ certificates or pending Challenges per namespace. It runs inside the Freelens desktop app as an installed extension.

## Tech stack

| Concern | Technology |
|---|---|
| UI runtime | Host-provided React 17 and MobX, consumed as globals — never bundled |
| Bundler | electron-vite with `preserveModules`, CommonJS output |
| Package manager | pnpm through corepack |

## Repository layout

```
freelens-filter-extension/
├── build/                  # global-externals plugin: maps host modules to globals
├── src/main/               # main-process entry (empty stub)
├── src/renderer/
│   ├── index.tsx           # page + sidebar menu registration
│   ├── components/         # ResourceFilterPage, FilterBar, ErrorBoundary, styles
│   ├── discovery/          # resource-kind discovery via apiManager
│   └── filtering/          # filter engine, field-path collector, store, persistence
├── tests/                  # render smoke test against the built bundle
├── docs/                   # this documentation set
└── update-installed.sh     # deploy helper for the local Freelens profile
```

## First steps

1. Install pnpm through corepack: `corepack enable pnpm && corepack prepare pnpm@10.34.4 --activate`
2. Install dependencies: `pnpm install`
3. Type-check and build: `pnpm type:check && pnpm build`
4. Run the tests: `pnpm test`
5. Pack a tarball: `pnpm pack`
6. Install into Freelens: drag the `*.tgz` onto the Freelens Extensions page. If the enable/disable loop appears, restart Freelens. It is a known host bug.
7. First code to read: `src/renderer/index.tsx` (registration), `src/renderer/components/resource-filter-page.tsx` (the page), `src/renderer/filtering/filter-engine.ts` (operator semantics).

## Where to find things when lost

| Question | Where to look |
|---|---|
| Why is my filter row ignored? | Operator semantics and empty-value rules in `src/renderer/filtering/filter-engine.ts` |
| Why is the field dropdown empty? | Field collection from loaded items in `src/renderer/filtering/field-paths.ts` |
| Where do filters and saved sets persist? | `src/renderer/filtering/filter-storage.ts` (localStorage, best-effort) |
| Where does the kind list come from? | `src/renderer/discovery/api-discovery.ts` |
| The page does not render. What now? | Log files under `~/.config/Freelens/logs/lens-renderer-cluster-*-frame.log` |
| How do I deploy a code change locally? | `./update-installed.sh` with Freelens quit |

## Companion documents

| File | Covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How it works and why |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Build, pack, install, debug how-tos |
| [AGENTS.md](../AGENTS.md) | Instructions for AI coding agents |

Decisions and their rationale live in the `delivery/madr` repository — link, never restate.
