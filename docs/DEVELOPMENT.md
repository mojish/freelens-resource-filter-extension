# Development — freelens-resource-filter-extension

## Prerequisites

| Tool | Purpose |
|---|---|
| Node.js ≥ 22 | Build toolchain |
| pnpm 10.x via corepack | Package manager |
| Freelens 2.x | Install target (`engines.freelens` in `package.json`) |

## Setup

```bash
corepack enable pnpm && corepack prepare pnpm@10.34.4 --activate
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install
```

The Electron development dependency supplies build metadata and SDK types; testing uses the installed Freelens/Chromium, so no separate Electron binary is needed. React 19, MobX 7 and mobx-react 10 must match the host.

Generated files: `out/` comes from the build and `*.tgz` from `pnpm pack`. Never hand-edit either.

## Build and test

```bash
pnpm type:check     # v2 SDK typings, plus renderer checking without Node globals
pnpm build          # electron-vite build → out/main, out/renderer
pnpm test           # pretest builds, then vitest: unit + render smoke tests
pnpm verify         # type-check + build + test + pack (what CI runs)
```

Unit tests cover the filter engine (every operator, path syntax, OR groups, matcher),
field collector / search, kubectl|yq|jq export, namespace scope, persistence (including
ui-prefs), and the MobX store. Feature/regression suites live under
`src/renderer/filtering/*test.ts`. The render smoke test loads the built ESM with mocked
`globalThis.FreelensExtensionApi` globals and React 19. The bundle contract test
activates main with only its process globals and checks renderer imports. Run a single suite with
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
with local resource and host mocks, serving the built renderer ESM unchanged. It checks watch refresh, catalog sampling,
query application, idle age filters, column IDs, and resource-store mount/unmount.
It reports a skip if Chrome/Chromium or the built bundle is absent. The separate
kind-menu check below exercises the real Freelens Select implementation.
`tests/update-installed.test.ts` runs the updater against disposable fixture
folders, including running-process and incomplete-build rejection, new v2 installs, and preservation of managed version directories and preference files. It never
writes to the real Freelens installation. The updater requires `pgrep`, `rsync`,
Bash and Node.js.

For kind-picker UI changes, select a namespace, open the resource menu, scroll
down with the mouse, and leave it open for several seconds. The one-second
namespace refresh must not return the menu to the top. Star a kind using this
page's Favorite button and verify it sorts first; Freelens sidebar favorites
are a separate feature.

## Install into Freelens

This branch builds **0.5.0 for Freelens 2.x**. Keep 0.4.0 for Freelens 1.x.
An old v1 package is marked Incompatible by v2; changing its engine range alone
is insufficient because the runtime globals, React and renderer format changed.

Tarball install:

1. Run `pnpm verify` to create `freelens-resource-filter-extension-0.5.0.tgz`.
2. Open Freelens → Extensions (`Ctrl+Shift+E`) and install that file.
3. Confirm version **0.5.0**, enable it, and open Resource Filter in a cluster.

Local development install/update on Linux:

```bash
pnpm verify
# Quit Freelens completely before the next command.
./update-installed.sh
```

The script copies `out/` and `package.json` into
`${XDG_CONFIG_HOME:-$HOME/.config}/Freelens/extensions/freelens-resource-filter-extension/`.
Set `FREELENS_USER_DATA_DIR` when the app uses a different profile directory.
It rejects running Freelens processes and incomplete builds before writing.
It can create the new v2 directory; the old `~/.freelens/extensions/` is untouched.

Freelens 2 scans its managed root on startup and adopts this unpacked copy as a
**development** install. This also selects it over version/digest subdirectories
left by a previous tarball install. The helper does not edit the installation
registry, enabled state, or preferences, and does not delete old version
directories; the host manages its registry and cleanup. Restart Freelens and
confirm **0.5.0** in Extensions; enable it if this is a first install.
For a managed installation instead, use the tarball through the host installer.

Saved filters retain their `frf:v1:*` keys and the durable preference store keeps
its name. The helper does not copy browser-origin storage between host versions;
filters stored under an old cluster-frame origin may need to be recreated.

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
- To check the runtime contract outside the host, run the built-renderer and
  browser tests (the browser test skips if Chrome/Chromium is unavailable):

```bash
pnpm build
pnpm exec vitest run tests/render.test.ts tests/bundle-contract.test.ts tests/browser.test.ts
```

- The application-data extension directory is watched by Freelens. Do not write it or the application profile while the app runs.
