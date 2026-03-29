#!/usr/bin/env bash
# Ensures WASM build artifacts exist in lib/bin/.
# If binaries are missing (e.g. Vercel build, fresh clone without LFS),
# downloads them from the published npm package.
#
# Usage: ./scripts/ensure-wasm.sh [--tag canary|latest]

set -euo pipefail

BIN_DIR="$(cd "$(dirname "$0")/../lib/bin" && pwd)"
WASM_FILE="$BIN_DIR/grida_canvas_wasm.wasm"
JS_FILE="$BIN_DIR/grida-canvas-wasm.js"

TAG="${1:-canary}"
if [ "$TAG" = "--tag" ]; then
  TAG="${2:-canary}"
fi

if [ -f "$WASM_FILE" ] && [ -f "$JS_FILE" ]; then
  echo "WASM artifacts already present in $BIN_DIR — skipping download"
  exit 0
fi

echo "WASM artifacts not found — downloading @grida/canvas-wasm@$TAG from npm..."

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

npm pack "@grida/canvas-wasm@$TAG" --pack-destination "$TMPDIR" 2>/dev/null

TARBALL="$(ls "$TMPDIR"/*.tgz)"
tar xzf "$TARBALL" -C "$TMPDIR"

mkdir -p "$BIN_DIR"

if [ -f "$TMPDIR/package/dist/grida_canvas_wasm.wasm" ]; then
  cp "$TMPDIR/package/dist/grida_canvas_wasm.wasm" "$WASM_FILE"
  cp "$TMPDIR/package/dist/grida-canvas-wasm.js" "$JS_FILE"
  echo "Downloaded and installed WASM artifacts from @grida/canvas-wasm@$TAG"
else
  echo "ERROR: npm package does not contain WASM artifacts"
  exit 1
fi
