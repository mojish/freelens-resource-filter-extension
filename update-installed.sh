#!/usr/bin/env bash
# Install/update an unpacked development copy for Freelens 2 on Linux.
#
# MUST be run while Freelens is NOT running: the extensions folder
# is watched by Freelens. The host adopts this unpacked copy on its next start.
# Managed tarball installs may instead live in version/digest subdirectories.
set -euo pipefail

USER_DATA_DIR="${FREELENS_USER_DATA_DIR:-${XDG_CONFIG_HOME:-${HOME}/.config}/Freelens}"
EXT_DIR="${USER_DATA_DIR}/extensions/freelens-resource-filter-extension"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if pgrep -ix 'freelens([-.][0-9].*)?|freelens\.appimage' >/dev/null 2>&1; then
  echo "ERROR: Freelens is running. Quit it completely, then re-run this script." >&2
  exit 1
fi

for entry in main/index.js renderer/index.mjs; do
  if [ ! -s "$REPO_DIR/out/$entry" ]; then
    echo "ERROR: missing build entry out/$entry. Run pnpm verify first." >&2
    exit 1
  fi
done

mkdir -p "$EXT_DIR"
rsync -a --delete "$REPO_DIR/out/" "$EXT_DIR/out/"
cp "$REPO_DIR/package.json" "$EXT_DIR/package.json"

echo "Updated $EXT_DIR to version $(node -p 'require(process.argv[1]).version' "$EXT_DIR/package.json")"
echo "Now start Freelens 2 and enable Resource Filter in Extensions if needed."
echo "Freelens will adopt this unpacked copy as a development installation."
