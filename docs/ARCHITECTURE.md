# Architecture — freelens-resource-filter-extension

## Components

- `src/renderer/index.tsx` — registers one cluster page (`resource-filter`) and its sidebar menu entry (`orderNumber: 15`, below "Cluster"). The page renders inside an `ErrorBoundary`.
- `src/renderer/components/resource-filter-page.tsx` — kind picker (favorites ★ / recent ↻), FilterBar wiring, namespace-scoped match counts, `KubeObjectListLayout`, and object-peek drawer (click a row name).
- `src/renderer/components/filter-bar.tsx` — query bar, filter rows (AND/OR), field path combobox, native operator `<select>`, output-field chips, table-column pins, yq/jq dialect, copy command, download matches, collapsible live command (`<details>`), saved sets.
- `src/renderer/components/error-boundary.tsx` — catches render crashes so the cluster frame stays usable.
- `src/renderer/filtering/filter-store.ts` — MobX rows + `revision` / `matchSignature` so preview and `N / M` update on remove and AND/OR toggles. Uses `makeObservable`, no decorators.
- `src/renderer/filtering/filter-engine.ts` — pure path resolution and operators (`=`, `!=`, `contains`, `!contains`, `regex`, `in`, `exists`, `!exists`, `older_than`, `newer_than`). Consecutive `or` rows form a group; groups are ANDed.
- `src/renderer/filtering/field-paths.ts` — walks a sample of loaded items (cap 200) into a field catalog + value suggestions; derives default table columns when the user has not pinned any.
- `src/renderer/filtering/field-path-search.ts` — multi-word / ranked matching for the custom field combobox (Freelens Select hardcodes substring filter).
- `src/renderer/filtering/filter-query.ts` — parse/serialize the one-line query bar.
- `src/renderer/filtering/kubectl-yq.ts` — builds `kubectl | yq` (mikefarah v4, `-o yaml`) or `kubectl | jq` (`-o json`; jq cannot parse YAML).
- `src/renderer/filtering/namespace-scope.ts` — applies the Freelens namespace picker to in-memory items (download, counts, list filter).
- `src/renderer/filtering/filter-storage.ts` — best-effort localStorage: active filters and sets per kind, per-kind session (output fields / columns / dialect), last kind, and `frf:v1:ui-prefs` (favorites, recent, preview open).
- `src/renderer/filtering/download-matches.ts` — projects matches to selected fields; serializes a JSON-compatible list as YAML (`yaml`, bundled) or JSON.
- `src/renderer/discovery/api-discovery.ts` — enumerates kinds from `Renderer.K8sApi.apiManager`.
- `src/main/index.ts` — activates the durable UI preferences store in the main process.
- `electron.vite.config.js` + `build/global-externals.js` — renderer entry under the `preload` key; CommonJS + `preserveModules`.

## System context

```mermaid
flowchart LR
    Eng["Engineer"] -->|clicks| Freelens["Freelens app"]
    subgraph Freelens
        Page["Resource Filter page<br/>(this extension)"]
        AM["apiManager<br/>(host)"]
        NS["namespaceStore<br/>(host)"]
        LS["localStorage<br/>(per cluster frame)"]
    end
    Page -->|"apis map, getStore()"| AM
    Page -->|"selected namespaces"| NS
    Page -->|"filters, sets, ui-prefs"| LS
    AM -->|"watch + list"| K8s["Kubernetes API"]
```

## Key invariants

- Built-in resource pages are never modified. Freelens exposes no hook to inject filters into built-in lists.
- Host modules stay external (`@freelensapp/extensions`, `react`, `react-dom`, `mobx`, `mobx-react`, `react-router-dom`) via `build/global-externals.js`.
- Output stays CommonJS with `preserveModules` (`out/main/index.js`, `out/renderer/index.js`).
- Resource changes resolve the new store before mounting a keyed host list; Freelens subscribes to stores at mount. Pinned columns use path-based sorting IDs and object cells show JSON.
- Relative-time rows, counts and preview use a shared clock snapshot refreshed every second; a matcher captures its evaluation time.
- Source compiles under tsc, oxc, and esbuild — no MobX decorators; use `makeObservable` maps.
- `apiManager.getStore(apiBase)` lazily creates CRD stores — call only from an effect, never during render.
- Field catalog comes from live items (sample of 200). Empty items ⇒ empty field dropdown. Resource-version fingerprints are read outside React memoization so MobX in-place, same-length updates invalidate catalog and count snapshots. Rebuild skips unchanged fingerprints.
- Filter rows: empty field/value disables a row (`exists` / `!exists` ignore value). Fields absent from the sampled catalog are marked but still applied. Sampling only limits suggestions, not matching. Auto-columns require observed scalar values.
- Combinators: default AND between rows; toggle OR on a row to join it with the previous into an OR-group; groups are ANDed.
- Namespace scope: Freelens namespace picker drives kubectl `-n` / `-A`, match counts, download, and list filtering (`namespace-scope.ts`).
- The kind picker element is memoized independently of namespace polling and item updates. Freelens Select recreates its menu on render, so unrelated parent renders must not reset the open menu's scroll.
- Kind favorites are owned by this extension, separate from Freelens sidebar favorites. They sort before recent and other kinds.
- yq predicates reduce non-null path values to one boolean per row; existence also excludes empty strings. `!exists` negates existence across the whole path, including wildcard paths.
- Both command dialects use optional access on each path segment (`.field?`, `[]?`, `[0]?`). A wildcard encountering an incompatible array/scalar skips that branch while retaining valid siblings, in filters and projections. A whole-path `try` alone would abort remaining branches after an error.
- The yq/jq dialect controls command generation and downloads: yq uses YAML (`.yaml`, `application/yaml`), jq JSON (`.json`, `application/json`). Both downloads preserve the same list shape, field projection, namespace scope and JSON representation (including resource `toJSON()`).
- Paths accept JSON-quoted map keys (`metadata.labels["app.kubernetes.io/name"]`) and optional array/map traversal. Invalid paths fail closed.
- Query parsing is quote-aware and atomic: any invalid clause rejects the whole query; empty input clears rows. Existence operators take no value.
- Commands compare literal strings (escaping yq's glob equality), support numeric/boolean equality semantics, and exclude null values. Age filters compare RFC3339 instants at millisecond precision; invalid dates do not match. Invalid durations disable a row, including its OR group as in the engine. Invalid regex syntax produces a false predicate instead of a failing command. Regex input is capped at 10,000 Unicode code points in all engines. Multi-field projections reduce each path to null, a scalar, or an array, so each resource yields one object. Commands include the selected API version. Regex syntax still differs across JavaScript, Go/yq and jq; jq lowercases ASCII only.
- Filtering / export code must stay kind-agnostic — no hard-coded CRD or product names in logic or examples.
- Persistence is best-effort. Filters/sets use cluster-frame localStorage (`frf:v1:*`). Favorites / recent / preview-open use Freelens `ExtensionStore` (`resource-filter-ui-prefs`) with a persisted `localStorageMigrated` flag. Local/legacy preferences are imported once, then the durable store is authoritative, including empty favorites and `previewOpen: false`. The atomic localStorage blob supersedes legacy keys.

## Primary flow

```mermaid
sequenceDiagram
    participant U as Engineer
    participant P as ResourceFilterPage
    participant D as api-discovery
    participant AM as apiManager (host)
    participant L as KubeObjectListLayout
    participant FE as filter-engine

    U->>P: opens page
    D->>AM: read apis map (observable)
    AM-->>D: all kinds incl. CRDs
    D-->>P: sorted kind list (+ favorites/recent)
    P->>P: restore last kind, filters, ui-prefs
    U->>P: picks a kind / adds filter rows
    P->>AM: getStore(apiBase) in effect
    AM-->>P: store
    P->>L: layout + filterItems (namespace + field matcher)
    L->>AM: loadAll + watch
    AM-->>L: items
    P->>P: catalog + match count N/M
    U->>P: Copy kubectl|yq / Download matches
    FE-->>U: filtered table / shell command / YAML or JSON file
```
