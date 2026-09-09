# Development — freelens-resource-filter-extension

## Prerequisites

| Tool | Purpose |
|---|---|
| Node.js ≥ 22 | Build toolchain |
| pnpm 10.x via corepack | Package manager |
| Freelens 1.10.x | Install target (`engines.freelens` in `package.json`) |

## Setup

```bash
corepack enable pnpm && corepack prepare pnpm@10.34.4 --activate
pnpm install
```

Generated files: `out/` comes from the build and `*.tgz` from `pnpm pack`. Never hand-edit either.

## Build and test

```bash
pnpm type:check     # tsc --noEmit against the @freelensapp/extensions typings
pnpm build          # electron-vite build → out/main, out/renderer
pnpm test           # pretest builds, then vitest: unit + render smoke tests
pnpm verify         # type-check + build + test + pack (what CI runs)
```

Unit tests cover the filter engine (every operator, path syntax, matcher),
field collector, persistence, and the MobX store. The render smoke test loads
the built bundle with mocked host globals and renders the page. Run a single
suite with `npx vitest run src/renderer/filtering/filter-engine.test.ts`.

## Install into Freelens

Fresh install (Extension page, drag and drop):

1. Open Freelens → Extensions (`Ctrl+Shift+E`).
2. Drag the `*.tgz` into the window.
3. If the extension flips between enabled and disabled, wait for it to settle and restart Freelens. It is a known host bug ([freelens#1005](https://github.com/freelensapp/freelens/issues/1005)).

Update an existing local install (no tgz round-trip):

```bash
./update-installed.sh   # refuses to run while Freelens is up
```

The script syncs `out/` and `package.json` into `~/.freelens/extensions/freelens-resource-filter-extension/`. Freelens picks up the new code on the next start.

## Lint and format

No linter is configured. Keep the existing style: TypeScript strict, double quotes, named imports. CI (GitHub Actions) runs `pnpm verify` on every push — see `.github/workflows/ci.yml`.

## Debugging

- Renderer errors land in `~/.config/Freelens/logs/lens-renderer-cluster-<id>-frame.log`. The main-process log is `lens.log` in the same directory.
- To check a build outside the host, require the bundles with mocked globals:

```bash
node -e "
global.LensExtensions = { Main:{LensExtension:class{}}, Renderer:{LensExtension:class{}, Component:{}, K8sApi:{apiManager:{apis:new Map()}} } };
global.Mobx = require('mobx'); global.MobxReact = require('mobx-react');
global.React = require('react'); global.ReactDom = require('react-dom');
global.ReactJsxRuntime = require('react/jsx-runtime'); global.ReactRouterDom = {};
console.log(typeof require('./out/renderer/index.js').default);
"
```

- `~/.freelens/extensions/<name>/` is watched by Freelens. Do not write there while the app runs.
