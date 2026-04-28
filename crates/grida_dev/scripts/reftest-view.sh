#!/usr/bin/env bash
# Serve the reftest dashboard against a result dir.
#
# Usage:
#   reftest-view.sh <result-dir> [port]
#
# Example:
#   crates/grida_dev/scripts/reftest-view.sh target/reftests/resvg-test-suite.htmlcss
#   crates/grida_dev/scripts/reftest-view.sh target/reftests/resvg-test-suite.htmlcss 8080
#
# The result dir must contain `report.json` and bucket dirs (S99/, S95/, ...).

set -euo pipefail

RESULT_DIR="${1:-}"
PORT="${2:-8000}"

if [[ -z "$RESULT_DIR" ]]; then
  echo "Usage: $0 <result-dir> [port]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DASHBOARD="$SCRIPT_DIR/reftest_dashboard.html"
FIXTURES_DIR="$REPO_ROOT/fixtures/local/resvg-test-suite/tests"

[[ -f "$DASHBOARD" ]]              || { echo "missing dashboard: $DASHBOARD" >&2; exit 1; }
[[ -d "$RESULT_DIR" ]]             || { echo "missing result dir: $RESULT_DIR" >&2; exit 1; }
[[ -f "$RESULT_DIR/report.json" ]] || { echo "no report.json in $RESULT_DIR" >&2; exit 1; }

LINK="$RESULT_DIR/index.html"
TESTS_LINK="$RESULT_DIR/tests"
ln -sf "$DASHBOARD" "$LINK"
if [[ -d "$FIXTURES_DIR" ]]; then
  ln -sf "$FIXTURES_DIR" "$TESTS_LINK"
else
  echo "warning: fixtures not found at $FIXTURES_DIR — original SVG tile will be empty" >&2
fi
trap 'rm -f "$LINK" "$TESTS_LINK"' EXIT INT TERM

echo "→ http://localhost:$PORT/  (result dir: $RESULT_DIR)"
exec python3 -m http.server "$PORT" --directory "$RESULT_DIR"
