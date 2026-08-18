#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/FixTradeZone}"
DOC_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixtradezone-project-docs"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Project directory not found: $PROJECT_DIR"
  exit 1
fi

mkdir -p "$PROJECT_DIR/docs"
cp -f "$DOC_SOURCE_DIR"/*.md "$PROJECT_DIR/docs/"

echo "FixTradeZone documentation installed into:"
echo "$PROJECT_DIR/docs"
ls -1 "$PROJECT_DIR/docs"
