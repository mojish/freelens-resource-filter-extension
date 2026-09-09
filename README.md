# freelens-resource-filter-extension

A [Freelens](https://freelens.app) extension that adds generic field-based filtering to any Kubernetes resource list. Pick any kind in the cluster, including CRDs, and filter it with rows like `spec.state = pending AND metadata.namespace = digifyshop`. Freelens extensions cannot modify built-in resource pages. The extension therefore ships its own "Resource Filter" cluster page and controls the whole list layout there.

Key mental model: the extension is a **separate page** in the cluster sidebar, directly below "Cluster". Built-in screens (Certificates, Pods, the CRD lists) stay untouched.

## Features

- Any resource kind, built-in or CRD, discovered live from the cluster
- Field/operator/value rows: `=`, `!=`, `contains`, `!contains`, `regex`, `in`, `exists`, `!exists` — ANDed
- Field paths walked from live objects, with value suggestions (`status.conditions[*].type` supported)
- Table columns derived from the data: the most common `spec`/`status` fields become sortable columns
- Filters persist per kind; named filter sets can be saved and reloaded
- Rows whose field is missing from the current kind are marked and skipped

## Installation

Install from the Extensions page (`Ctrl+Shift+E`) by name after the first npm release, or drag the packed `*.tgz` into the window. Build commands live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Getting started, repo map |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the page, discovery, and filter engine work |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Build, test, install, debug how-tos |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |

Decisions and their rationale live in the `delivery/madr` repository.
