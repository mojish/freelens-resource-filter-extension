#!/usr/bin/env bash
# Safely update the locally-installed copy of freelens-resource-filter-extension.
#
# MUST be run while Freelens is NOT running: the extensions folder
# (~/.freelens/extensions) is watched by Freelens, and rewriting package.json
# while the app is up re-triggers the known enable/disable loader loop
# (https://github.com/freelensapp/freelens/issues/1005).
set -euo pipefail

EXT_DIR="${HOME}/.freelens/extensions/freelens-resource-filter-extension"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if pgrep -f '/opt/Freelens/freelens' >/dev/null 2>&1; then
  echo "ERROR: Freelens is running. Quit it completely, then re-run this script." >&2
  exit 1
fi

if [ ! -d "$EXT_DIR" ]; then
  echo "ERROR: installed extension not found at $EXT_DIR" >&2
  echo "Install it instead: Freelens -> Extensions -> drag in $(cd "$REPO_DIR" && ls *.tgz | head -1)" >&2
  exit 1
fi

rsync -a --delete "$REPO_DIR/out/" "$EXT_DIR/out/"
cp "$REPO_DIR/package.json" "$EXT_DIR/package.json"

echo "Updated $EXT_DIR to version $(node -p "require('$EXT_DIR/package.json').version")"
echo "Now start Freelens, open a cluster, and use the 'Resource Filter' page."
