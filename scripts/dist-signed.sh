#!/usr/bin/env bash
# Build a signed + notarized DMG using credentials from .env.signing.
# Usage: pnpm dist:mac:signed   (or: bash scripts/dist-signed.sh)
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env.signing"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found."
  echo "Copy .env.example to .env.signing and fill in your credentials."
  exit 1
fi

# Load vars without polluting the parent shell
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

exec pnpm dist:mac
