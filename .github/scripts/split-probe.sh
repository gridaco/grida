#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# P1 — engine-split forbidden-token probe
#
# The Rust engine moved to gridaco/nothing. A reference that reads as current
# but describes the departed tree is worse than no reference: an absent doc
# makes you look, a confidently wrong one makes you act. This probe fails when
# a departed path/toolchain token appears in tracked files as if it were still
# local to this repo.
#
# Deliberate cross-repo POINTERS are exempt: any line that names the engine
# repo explicitly (github.com/gridaco/nothing) is a pointer, not a lie.
# Historical records (HISTORY.md, docs/_history, archived trees) are decay,
# not lies — excluded. Earned exceptions live in split-probe-allow.txt
# (path<TAB>reason; a trailing "/" grants a directory prefix), asserted
# non-stale by the P4 half below.
#
# Derived from the extraction manifest (the path set that left this repo).
# ---------------------------------------------------------------------------
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

TOKENS=(
  'crates/'
  'format/grida\.fbs'
  'bin/activate-flatc'
  'bin/activate-emsdk'
  'third_party/usvg'
  'third_party/externals'
  'packages/grida-reftest'
  'rust-toolchain\.toml'
  'model-v2/'
  'grida_wpt'
  'cargo (build|test|check|clippy|fmt|run)'
)

# Trees that are historical/generated/deprecated by declaration — decay, not lies.
EXCLUDES=(
  ':!HISTORY.md'
  ':!docs/_history'
  ':!docs/@designto-code'
  ':!docs/cli'
  ':!apps/docs/build'
  ':!pnpm-lock.yaml'
  ':!.ref'
  ':!.github/scripts/split-probe.sh'
  ':!.github/scripts/split-probe-allow.txt'
)

ALLOW_FILE=".github/scripts/split-probe-allow.txt"
PATTERN="$(IFS='|'; echo "${TOKENS[*]}")"

# grep.threads=1: deterministic, low-memory. git grep exits 0 = hits,
# 1 = no hits, anything else = the search itself failed — and a failed
# search MUST fail the probe (a killed grep once produced a false "clean").
set +e
RAW=$(git -c grep.threads=1 grep -nIE "$PATTERN" -- . "${EXCLUDES[@]}" 2>&1)
GREP_EXIT=$?
set -e
if [ "$GREP_EXIT" -gt 1 ]; then
  echo "::error::[P1] git grep failed (exit $GREP_EXIT) — the probe cannot claim clean. Output:"
  echo "$RAW" | head -5
  exit 1
fi

# Exempt pointer lines (explicit engine-repo URL = deliberate cross-repo ref)
HITS=$(echo "$RAW" | grep -v 'github\.com/gridaco/nothing' | grep -v '^$' || true)

# Apply the allowlist: exact file grants, or directory-prefix grants (trailing /)
if [ -s "$ALLOW_FILE" ]; then
  while IFS=$'\t' read -r path _reason; do
    [ -z "$path" ] && continue
    case "$path" in \#*) continue ;; esac
    case "$path" in
      */) HITS=$(echo "$HITS" | grep -v "^$path" || true) ;;
      *)  HITS=$(echo "$HITS" | grep -v "^$path:" || true) ;;
    esac
  done < "$ALLOW_FILE"
fi

# ---- P4 half: the allowlist itself must not go stale (fail-open guard) ----
P4_FAIL=0
if [ -s "$ALLOW_FILE" ]; then
  while IFS=$'\t' read -r path _reason; do
    [ -z "$path" ] && continue
    case "$path" in \#*) continue ;; esac
    case "$path" in
      */)
        if [ -z "$(git ls-files "$path" | head -1)" ]; then
          echo "::error::[P4] allowlist grants a directory with no tracked files: $path"
          P4_FAIL=1
        elif ! echo "$RAW" | grep -q "^$path"; then
          echo "::error::[P4] allowlist directory grant no longer matches anything — remove it: $path"
          P4_FAIL=1
        fi
        ;;
      *)
        if ! git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
          echo "::error::[P4] allowlist grants a path that no longer exists: $path"
          P4_FAIL=1
        elif ! echo "$RAW" | grep -q "^$path:"; then
          echo "::error::[P4] allowlist grants a path with no matches — remove the stale grant: $path"
          P4_FAIL=1
        fi
        ;;
    esac
  done < "$ALLOW_FILE"
fi

if [ -n "$HITS" ]; then
  echo "::error::[P1] departed-engine references found (fix, point at github.com/gridaco/nothing, or add an allowlist grant with a reason):"
  echo "$HITS" | head -60
  echo "---"
  echo "$HITS" | cut -d: -f1 | sort -u | sed 's/^/  /'
  exit 1
fi

[ "$P4_FAIL" -ne 0 ] && exit 1
echo "[split-probe] clean — no departed-engine references outside pointers/allowlist."
exit 0
