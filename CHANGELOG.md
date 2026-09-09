# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
