#!/usr/bin/env bash
# Decide whether the viewer build can be skipped for the current commit range.
#
# Exit 0 → no changed file is part of the viewer app's declared dependency
#          tree; safe to skip the build.
# Exit non-zero → at least one change is in a dep (or we couldn't tell).
#
# Same shape as editor/skip-build.sh — tool-agnostic, usable wherever a CI
# runner can branch on an exit code (Vercel ignoreCommand, GitHub Actions).
# The script itself knows nothing about the host.

set -uo pipefail

# ---------------------------------------------------------------------------
# DEPS — repo-relative patterns of paths the viewer build consumes.
#
# The viewer is a self-contained Next.js app under apps/viewer with no
# workspace:* deps — nothing else in the monorepo is pulled in at build time.
#
# Pattern syntax (gitignore-like, evaluated by bash `case`):
#   "/foo"      → root-anchored: matches "foo" at repo root only
#   "foo/"      → directory subtree (the dir and everything inside)
#   "foo/bar"   → exact path match
#   "*.md"      → bash glob, matches anywhere in the tree
# ---------------------------------------------------------------------------
DEPS=(
  # the Next.js app itself
  "apps/viewer/"

  # build orchestration at the repo root
  "/package.json"
  "/pnpm-workspace.yaml"
  "/pnpm-lock.yaml"
  "/turbo.json"
)

is_dep() {
  local f="$1" p
  for p in "${DEPS[@]}"; do
    case "$p" in
      /*)
        case "$f" in "${p#/}") return 0 ;; esac
        ;;
      */)
        case "$f" in "$p"*) return 0 ;; esac
        ;;
      *)
        # shellcheck disable=SC2254
        case "$f" in $p) return 0 ;; esac
        ;;
    esac
  done
  return 1
}

BASE="${PREVIOUS_SHA:-${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}}"

if ! CHANGED=$(git diff --name-only "$BASE" HEAD 2>/dev/null); then
  echo "[skip-build] could not diff against $BASE — building."
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "[skip-build] empty diff against $BASE — building."
  exit 1
fi

DEP_HITS=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  is_dep "$f" && DEP_HITS+=("$f")
done <<< "$CHANGED"

if [ ${#DEP_HITS[@]} -eq 0 ]; then
  echo "[skip-build] no changes in viewer build deps — skipping."
  echo "$CHANGED" | sed 's/^/  /'
  exit 0
fi

echo "[skip-build] changes touch viewer build deps — building."
printf '  %s\n' "${DEP_HITS[@]}"
exit 1
