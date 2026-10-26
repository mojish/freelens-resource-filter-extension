# freelens-resource-filter-extension

[![CI](https://github.com/mojish/freelens-resource-filter-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/mojish/freelens-resource-filter-extension/actions/workflows/ci.yml)

A [Freelens](https://freelens.app) extension that adds generic field-based filtering to any Kubernetes resource list. Pick any kind in the cluster, including CRDs, and filter with rows like `spec.state = pending OR spec.state = ready`. Freelens extensions cannot modify built-in resource pages, so this extension ships its own **Resource Filter** cluster page.

Open **Resource Filter** in the cluster sidebar, directly below "Cluster".

## Features

- Any resource kind (built-in or CRD), discovered live from the cluster
- Field / operator / value rows with AND/OR groups; operators include `=`, `!=`, `contains`, `regex`, `in`, `exists`, `older than` / `newer than`
- Query bar that compiles into rows; `/` focuses it
- Field paths from live objects; multi-word field search; value suggestions from peer-filtered items
- Freelens namespace scope applied to the table, match counts, download, and kubectl `-n` / `-A`
- Collapsible live `kubectl|yq` or `kubectl|jq` preview (`jq` uses `-o json`); copy command; download matching YAML or JSON (output fields + namespace)
- Output-field chips; user-pinned table columns; saved filter sets (include output/columns)
- Resource Filter's own kind favorites ★ and recent ↻ sort first; these are separate from Freelens sidebar favorites. Click a name to peek object JSON
- Active filters and saved sets persist per cluster frame; favorites, recent kinds, and preview preferences use the durable Freelens extension store

The yq/jq toggle selects both the copied command dialect and download format:
**yq → YAML (`.yaml`)**, **jq → JSON (`.json`)**. Both downloads contain a list of
matching resources, or projected fields when selected, within the current namespace scope.

Quoted map keys work in filters and output fields, for example
`metadata.labels["app.kubernetes.io/name"]`. The field catalog samples up to 200
objects for suggestions; manually entered fields still filter the entire list.
The query bar supports valueless `exists` / `!exists` and quoted values containing
`AND` / `OR`. Malformed queries show an error and keep the current rows; applying
an empty query clears them. Age filters accept RFC3339 timestamps (including
fractional seconds and timezone offsets) and durations such as `7d` or `24h`.
Invalid or overflowing durations leave the row inactive with a visible warning.

The yq command requires [mikefarah/yq v4](https://github.com/mikefarah/yq), not the
Python `yq` wrapper. Its [Go regex syntax](https://mikefarah.gitbook.io/yq/operators/string-operators)
does not support lookahead, lookbehind, or backreferences; choose jq for those patterns.

## Installation

Requires Freelens 1.10 or newer. In Freelens, open Extensions (`Ctrl+Shift+E`), search for `freelens-resource-filter-extension`, and install. Or open:

```
freelens://app/extensions/install/freelens-resource-filter-extension
```

You can also download the `.tgz` from [GitHub Releases](https://github.com/mojish/freelens-resource-filter-extension/releases) and install it from the Extensions page. To update a local checkout, run `pnpm verify`, quit Freelens completely, and run `./update-installed.sh`. Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Getting started, repo map |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the page, discovery, and filter engine work |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Build, test, install, debug how-tos |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |
