#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP="$ROOT/nexus-desktop"
VENDOR="$DESKTOP/vscodium"

if [[ ! -d "$VENDOR" ]]; then
  echo "Cloning VSCodium..."
  git clone --depth 1 https://github.com/VSCodium/vscodium.git "$VENDOR"
fi

cp -f "$DESKTOP/product/product.json" "$VENDOR/product.json"
mkdir -p "$VENDOR/builtin-extensions"
for ext in "$DESKTOP/extensions"/*/; do
  name="$(basename "$ext")"
  rm -rf "$VENDOR/builtin-extensions/$name"
  cp -a "$ext" "$VENDOR/builtin-extensions/$name"
  echo "Bundled extension: $name"
done
echo "Prepare complete."
