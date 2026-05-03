#!/usr/bin/env bash
# Thin wrapper around `cargo run -p grida_dev -- reftest view`.
set -euo pipefail
RESULT_DIR="${1:?usage: $0 <result-dir> [port]}"
PORT="${2:-8000}"
exec cargo run --release -p grida_dev -- reftest view "$RESULT_DIR" --port "$PORT"
