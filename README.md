# freelens-resource-filter-extension

A [Freelens](https://freelens.app) extension that adds generic field-based filtering to any Kubernetes resource list. Pick any kind in the cluster, including CRDs, and filter it with rows like `spec.state = pending AND metadata.namespace = digifyshop`. Freelens extensions cannot modify built-in resource pages. The extension therefore ships its own "Resource Filter" cluster page and controls the whole list layout there.

Key mental model: the extension is a **separate page** in the cluster sidebar. Built-in screens (Certificates, Pods, the CRD lists) stay untouched.

## Deployment

- Install the packed `*.tgz` through the Freelens Extensions page, or update the installed copy with `./update-installed.sh`. Commands live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Getting started, repo map |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the page, discovery, and filter engine work |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Build, pack, install, debug how-tos |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |

Decisions and their rationale live in the `delivery/madr` repository.
