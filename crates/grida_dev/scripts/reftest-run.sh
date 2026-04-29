#!/usr/bin/env bash
# Thin wrapper around `cargo run -p grida_dev -- reftest run` against
# the resvg-test-suite. Kept for backwards-compat with bookmarks; the
# canonical entry point is the cargo command.
#
# Usage:
#   reftest-run.sh                       # all 1679 fixtures
#   reftest-run.sh <filter>              # subset, e.g. "text_*" or "filters_feBlend"
#   RENDERER=iosvg reftest-run.sh        # use the import-based renderer instead

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

RENDERER="${RENDERER:-htmlcss}"
SUITE_DIR="fixtures/local/resvg-test-suite"
FILTER="${1:-}"

ARGS=(--suite-dir "$SUITE_DIR" --renderer "$RENDERER" --threshold 0.1)
[[ -n "$FILTER" ]] && ARGS+=(--filter "$FILTER")

cargo run --release -p grida_dev -- reftest run "${ARGS[@]}"

# Print the richer per-bucket summary.
REPORT="target/reftests/resvg-test-suite.${RENDERER}/report.json"
[[ "$RENDERER" == "iosvg" ]] && REPORT="target/reftests/resvg-test-suite/report.json"
[[ -f "$REPORT" ]] && cargo run --release -q -p grida_dev -- reftest summary --report "$REPORT" || true
