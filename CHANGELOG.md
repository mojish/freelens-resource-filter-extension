# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] — 2026-09-20

### Fixed
- Favorites / recent persist via Freelens `ExtensionStore` (disk-backed), with
  localStorage as a merge backup — survives force-quit better than localStorage alone.

## [0.3.2] — 2026-09-20

### Fixed
- Download matches now respects the Freelens namespace picker (same scope as the table / kubectl command).
- Favorites/recent use a single `frf:v1:ui-prefs` blob, migrate legacy keys, and re-load when kinds appear.

### Changed
- Live kubectl command is collapsed by default (`<details>`); open state is remembered.

## [0.3.1] — 2026-09-20

### Fixed
- Live kubectl preview and `N / M` counts refresh when removing a row or toggling AND/OR.
- jq dialect now uses `kubectl -o json` (jq cannot parse YAML).
- Operator picker uses a native `<select>` so `newer than` no longer flips to `older than`.
- Download matches respects selected output fields.
- Favorites persist via localStorage and reload on window focus.
- Add filter sits above the kubectl output section; field picker shows ↑↓/Enter hints.

### Removed
- Kind-specific projection presets and domain-specific example names in code/tests.
- Copy share link, export/import sets, copy-names, and delete-dry-run buttons.
- “Explain this filter” line (was unclear).

## [0.3.0] — 2026-09-20

### Added
- Live kubectl|yq/jq command preview with match count (`N / M items`).
- OR groups between filter rows (AND of OR-groups); query bar parse/serialize.
- Persist output fields + table columns in saved sets; export/import sets as JSON.
- Empty-match teaching hints; catalog sampling banner when items exceed 200.
- Keyboard field picker (↑/↓/Enter); `/` focuses the query bar.
- Value suggestions from peer-filtered items; yq/jq dialect toggle.
- Per-kind projection presets; copy names / delete dry-run; download matches.
- Plain-language “Explain this filter”; user-pinned table columns; YAML peek drawer.
- Kind favorites/recent; Freelens namespace badge; share URL hash (`#frf=…`).
- `older_than` / `newer_than` time operators (`7d`, `24h`, `30m`); semantic `?` help.
- Catalog rebuild skips when item fingerprints are unchanged.

## [0.2.8] — 2026-09-20

### Fixed
- Field search ranking: multi-word queries like `record type` prefer
  key-agnostic paths (`spec.records[*][*].type`) over named-key deep paths.
  Same ranking is used for filter fields and kubectl output Add field.

## [0.2.7] — 2026-09-20

### Fixed
- Field catalog now includes object containers (`spec`, `spec.records`, …), so
  searching `spec.records` proposes that path.
- Field search ranks exact/shorter matches first; Enter picks an exact or typed
  path instead of always the first deep child.

## [0.2.6] — 2026-09-20

### Added
- kubectl|yq output field picker: click presets (`name`, `namespace`, `spec`,
  `status`) or add any discovered path. Empty = full object; one or more fields
  are projected in the copied yq command.

## [0.2.5] — 2026-09-20

### Fixed
- Copy kubectl|yq re-reads the Freelens namespace picker at click time, so
  switching to All Namespaces yields `-A` instead of a stale `-n <previous>`.

## [0.2.4] — 2026-09-20

### Fixed
- kubectl|yq export now targets mikefarah/yq v4 (`select((path | to_string | downcase) == …)`),
  which is the dialect the Copy button is meant for.
- A Freelens namespace selection becomes `kubectl -n <ns>` instead of always `-A`.

## [0.2.3] — 2026-09-20

### Fixed
- Field-path search: Freelens Select hardcodes a literal substring filter, so
  multi-word queries like `record type` never matched. The field control is now
  a custom combobox that applies our token/`.*` matching.

### Added
- "Copy kubectl|yq" button: copies a `kubectl get … -o yaml | yq '…'` one-liner
  for the active filters (case-insensitive, same path semantics as the UI), e.g.
  `kubectl get domainzones.delivery.cafebazaar.cloud -A -o yaml | yq '.items[] | select(any(.spec.records[][].type; …))'`.

## [0.2.2] — 2026-09-20

### Added
- Smarter field-path search: whitespace-separated tokens match in order
  (e.g. `record type` finds `spec.records.@[*].type`); a single token can also
  be a regex.

## [0.2.1] — 2026-09-20

### Added
- `[*]` on maps/objects fans out all values, so filters like
  `spec.records[*][*].type = AAAA` match without knowing each map key.
  Map-of-arrays paths are also offered in the field dropdown.

## [0.2.0] — 2026-09-09

### Added
- `in` operator: match a field against a comma-separated list of values.
- Data-derived table columns: the two most common `spec`/`status` scalar fields
  become sortable columns.
- Per-kind filter persistence: active rows are restored when a kind is
  reopened, and the last selected kind is restored on page open.
- Named filter sets: save, load, and delete named filter sets per resource kind.
- Error boundary around the page: a render crash no longer blanks the cluster
  frame.
- Stale-row marking: rows whose field is missing from the current kind are
  highlighted and skipped while filtering.
- Three-state field placeholder: distinguishes "no kind", "loading", and
  "no items".
- Test suite (vitest): unit tests for the filter engine, field collector,
  storage, and MobX store; render smoke test against the built bundle.
- CI workflow (GitHub Actions): type-check, build, test, pack, artifact upload.

### Changed
- Filter matching compiles regexes once per pass instead of per item.
- Filter rows with an empty field are now disabled instead of emptying the table.
- Removed the decorator toolchain: the MobX store uses `makeObservable`
  annotations, simplifying the build.

### Fixed
- Sidebar entry sorted last; it now sits directly below "Cluster"
  (`orderNumber: 15`).
- Field catalog stayed empty when items loaded (stale memo).
- Double store loading (manual `loadAll` racing the list layout's own load).
- Store creation during render (moved into an effect).

## [0.1.3] — 2026-09-09

### Fixed
- "Resource Filter" sidebar entry positioned at a fixed order (15), right below
  the built-in "Cluster" item.
- Filter bar always visible, including before a resource kind is picked.
- Kind and field dropdowns are searchable again.

## [0.1.1] — 2026-09-09

### Fixed
- Field dropdown populated once items load (memo keyed on item count and load
  state instead of the observable array identity).
- Removed manual store loading and per-render store allocation.

## [0.1.0] — 2026-09-09

### Added
- Initial release: generic resource-kind discovery via `apiManager`,
  field/operator/value filter rows, generic list layout with ANDed filtering.
