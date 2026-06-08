#!/usr/bin/env bash
set -euo pipefail

# Sync essentials to a remote droplet.
# Excludes virtualenvs, node_modules, data, __pycache__, and other build artifacts.
# Usage:
#   DROPLET_HOST=user@your.droplet.ip ./dev_scripts/sync_to_droplet.sh
# Optionally set DROPLET_PATH (default: ~/ticketprinter).

HOST="${DROPLET_HOST:-}"
DEST="${DROPLET_PATH:-~/ticketprinter}"

if [[ -z "$HOST" ]]; then
  echo "Set DROPLET_HOST (e.g., user@1.2.3.4) then rerun." >&2
  exit 1
fi

rsync -avz --delete \
  --exclude '.git' \
  --exclude 'venv' \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  ./ "${HOST}:${DEST}"

echo "Sync complete to ${HOST}:${DEST}"
