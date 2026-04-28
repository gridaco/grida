#!/usr/bin/env bash
# Run the resvg-test-suite reftests against the htmlcss renderer.
#
# Usage:
#   reftest-run.sh                       # all 1679 fixtures
#   reftest-run.sh <filter>              # subset, e.g. "text_*" or "filters_feBlend"
#   RENDERER=iosvg reftest-run.sh        # use the import-based renderer instead
#
# Output: target/reftests/resvg-test-suite.htmlcss/ (or .iosvg/ depending on RENDERER)
#         report.json + S99/ S95/ S90/ S75/ buckets of <name>.{current,expected,diff}.png
#
# After it finishes:
#   crates/grida_dev/scripts/reftest-view.sh target/reftests/resvg-test-suite.htmlcss

set -euo pipefail

# Resolve repo root from this script's location, so it runs the same
# regardless of the caller's CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

RENDERER="${RENDERER:-htmlcss}"
SUITE_DIR="fixtures/local/resvg-test-suite"
FILTER="${1:-}"

if [[ ! -d "$SUITE_DIR" ]]; then
  echo "Suite dir not found: $SUITE_DIR" >&2
  echo "Make sure fixtures/local/resvg-test-suite is checked out." >&2
  exit 1
fi

ARGS=(--suite-dir "$SUITE_DIR" --renderer "$RENDERER" --threshold 0.1)
if [[ -n "$FILTER" ]]; then
  ARGS+=(--filter "$FILTER")
fi

cargo run --release -p grida_dev -- reftest "${ARGS[@]}"

# Aggregate summary on top of the runner's own one-line print.
REPORT="target/reftests/resvg-test-suite.${RENDERER}/report.json"
if [[ "$RENDERER" == "iosvg" ]]; then
  REPORT="target/reftests/resvg-test-suite/report.json"
fi
if [[ -f "$REPORT" ]] && command -v jq >/dev/null 2>&1; then
  echo
  echo "── Aggregate by top-level category ──"
  jq -r '
    [.tests[]]
    | group_by(.test_name | split("_")[0])
    | map({
        cat: .[0].test_name | split("_")[0],
        n: length,
        avg: (map(.similarity_score) | add / length),
        perfect: (map(select(.similarity_score == 1.0)) | length),
        ge_95: (map(select(.similarity_score >= 0.95)) | length)
      })
    | sort_by(-.n)
    | .[]
    | "\(.cat)\t n=\(.n)\t avg=\(.avg * 1000 | floor / 1000)\t perfect=\(.perfect)\t >=0.95=\(.ge_95)"
  ' "$REPORT"
fi
