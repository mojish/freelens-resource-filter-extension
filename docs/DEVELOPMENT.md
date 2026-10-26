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

Unit tests cover the filter engine (every operator, path syntax, OR groups, matcher),
field collector / search, kubectl|yq|jq export, namespace scope, persistence (including
ui-prefs), and the MobX store. Feature/regression suites live under
`src/renderer/filtering/*test.ts`. The render smoke test loads the built bundle with
mocked host globals. Run a single suite with
`pnpm exec vitest run src/renderer/filtering/filter-engine.test.ts`.

The command integration cases execute the installed **mikefarah/yq v4** and **jq**
against local fixtures (no cluster access). They cover scalar/wildcard paths,
missing/null/empty values, string/existence operators, OR groups, and mixed
arrays/maps with valid siblings after incompatible branches. Combined age,
nested equality, and wildcard absence filters and output projections run in both
dialects. Without the respective executable, Vitest reports its cases as skipped;
string assertions alone do not validate command execution. Check `yq --version`
and `jq --version`, then run
`pnpm exec vitest run src/renderer/filtering/kubectl-yq.test.ts` when changing exports.
The built-renderer tests also exercise downloads with both command dialects and
check YAML/JSON payloads, MIME types, filenames, and output-field projection.
`audit-regressions.test.ts` covers query round-trips and rejection, quoted keys,
unsampled fields, scalar columns, overflow, and command/UI equality and time parity.
Tests execute commands against fixtures with nulls, literal `*`, numbers, booleans,
timezone offsets, fractions, and invalid timestamps. Built-store tests verify the
one-time preference migration and stale-frame removal case.

Additional renderer checks (mock resources; no cluster writes):

1. With a `spec.state = ready` filter and one ready item, replace the observable
   store array in place with one pending item at a new resourceVersion. Both the
   table and badge must change from 1 to 0; newly added fields must be suggested.
2. With 201 items and a field only on item 201, enter that field manually. Table,
   badge and download must all show the same single match despite catalog sampling.
3. Apply existence and quoted-AND queries, then a malformed query. The malformed
   query must show an error without changing results; an empty query clears rows.
4. Download in each dialect, including full objects and projected fields. Verify
   filename, MIME and parsed content. `yaml@2.9.1` is a bundled build dependency;
   the packed tarball must include its generated modules under `out/renderer/`.

`tests/browser.test.ts` runs the built page in an isolated Chrome/Chromium profile
with local resource and host mocks. It checks watch refresh, catalog sampling,
query application, idle age filters, column IDs, and resource-store mount/unmount.
It reports a skip if Chrome/Chromium or the built bundle is absent. The separate
kind-menu check below exercises the real Freelens Select implementation.
`tests/update-installed.test.ts` runs the updater against disposable fixture
folders, including running-process and incomplete-build rejection. It never
writes to the real Freelens installation. The updater requires `pgrep`, `rsync`,
Bash and Node.js.

For kind-picker UI changes, select a namespace, open the resource menu, scroll
down with the mouse, and leave it open for several seconds. The one-second
namespace refresh must not return the menu to the top. Star a kind using this
page's Favorite button and verify it sorts first; Freelens sidebar favorites
are a separate feature.

## Install into Freelens

Fresh install (Extension page, drag and drop):

1. Open Freelens → Extensions (`Ctrl+Shift+E`).
2. Drag the `*.tgz` into the window.
3. If the extension flips between enabled and disabled, wait for it to settle and restart Freelens. It is a known host bug ([freelens#1005](https://github.com/freelensapp/freelens/issues/1005)).

Update an existing local install (no tgz round-trip):

```bash
pnpm verify            # build/test/pack the current source
./update-installed.sh   # refuses to run while Freelens is up or the build is incomplete
```

The script syncs `out/` and `package.json` into `~/.freelens/extensions/freelens-resource-filter-extension/`. Freelens picks up the new code on the next start. For this update, confirm version
**0.4.0** in Extensions after restarting. If the script reports no installed
extension, use `freelens-resource-filter-extension-0.4.0.tgz` from the project root
in the Extensions page; restart Freelens after installation.

## Release

1. Update `package.json` and `CHANGELOG.md`, then run `pnpm verify`.
2. Push the reviewed commit and confirm its CI run succeeds.
3. Push a matching `v<version>` tag. `.github/workflows/release.yml` verifies the
   source, publishes the package to npm using the repository's `NPM_TOKEN`, and
   creates a GitHub release with the packed tarball.
4. Confirm both the npm version and GitHub release asset exist before opening a
   marketplace PR to update `extensions/freelens-resource-filter-extension/extension.yaml`.
   The marketplace regenerates its `extensions.json` after merge.

## Lint and format

No linter is configured. Keep the existing style: TypeScript strict, double quotes, named imports. CI (GitHub Actions) runs `pnpm verify` on every push — see `.github/workflows/ci.yml`.

## Debugging

- Renderer errors land in `~/.config/Freelens/logs/lens-renderer-cluster-<id>-frame.log`. The main-process log is `lens.log` in the same directory.
- To check a build outside the host, require the bundles with mocked globals:

```bash
node -e "
global.LensExtensions = { Common:{Store:{ExtensionStore:class{}}}, Main:{LensExtension:class{}}, Renderer:{LensExtension:class{}, Component:{}, K8sApi:{apiManager:{apis:new Map()}} } };
global.Mobx = require('mobx'); global.MobxReact = require('mobx-react');
global.React = require('react'); global.ReactDom = require('react-dom');
global.ReactJsxRuntime = require('react/jsx-runtime'); global.ReactRouterDom = {};
console.log(typeof require('./out/renderer/index.js').default);
"
```

- `~/.freelens/extensions/<name>/` is watched by Freelens. Do not write there while the app runs.
