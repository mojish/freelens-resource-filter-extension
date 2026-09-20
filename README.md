# freelens-resource-filter-extension

[![CI](https://github.com/mojish/freelens-resource-filter-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/mojish/freelens-resource-filter-extension/actions/workflows/ci.yml)

A [Freelens](https://freelens.app) extension that adds generic field-based filtering to any Kubernetes resource list. Pick any kind in the cluster, including CRDs, and filter with rows like `spec.state = pending OR spec.state = ready`. Freelens extensions cannot modify built-in resource pages, so this extension ships its own **Resource Filter** cluster page.

Key mental model: a **separate page** in the cluster sidebar, directly below "Cluster". Built-in screens stay untouched.

## Features

- Any resource kind (built-in or CRD), discovered live from the cluster
- Field / operator / value rows with AND/OR groups; operators include `=`, `!=`, `contains`, `regex`, `in`, `exists`, `older than` / `newer than`
- Query bar that compiles into rows; `/` focuses it
- Field paths from live objects; multi-word field search; value suggestions from peer-filtered items
- Freelens namespace scope applied to the table, match counts, download, and kubectl `-n` / `-A`
- Collapsible live `kubectl|yq` or `kubectl|jq` preview (`jq` uses `-o json`); copy command; download matches (output fields + namespace)
- Output-field chips; user-pinned table columns; saved filter sets (include output/columns)
- Kind favorites ★ and recent ↻; click a name to peek object JSON
- Filters, sets, and UI prefs persist per cluster frame (localStorage)

## Installation

Requires Freelens 1.10 or newer. In Freelens, open Extensions (`Ctrl+Shift+E`), search for `freelens-resource-filter-extension`, and install. Or open:

```
freelens://app/extensions/install/freelens-resource-filter-extension
```

Until the first npm release is out, build from source (`pnpm pack`) or sync a local install with `./update-installed.sh` (Freelens must be quit). Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Getting started, repo map |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the page, discovery, and filter engine work |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Build, test, install, debug how-tos |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |
