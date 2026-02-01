#!/usr/bin/env bash
set -euo pipefail

args=()
has_support_longjmp=false

for arg in "$@"; do
  case "$arg" in
    -fwasm-exceptions)
      # Strip wasm EH flag to keep Emscripten in JS EH mode.
      ;;
    -sSUPPORT_LONGJMP=*)
      has_support_longjmp=true
      args+=("$arg")
      ;;
    -sWASM_LEGACY_EXCEPTIONS*|-sWASM_EXCEPTIONS*)
      # Avoid wasm EH settings; keep JS EH behavior consistent.
      ;;
    *)
      args+=("$arg")
      ;;
  esac
done

if [ "$has_support_longjmp" = false ]; then
  args+=("-sSUPPORT_LONGJMP=emscripten")
fi

exec emcc "${args[@]}"
