#!/usr/bin/env bash
# Decide whether the docs build can be skipped for the current commit range.
#
# Exit 0 → no changed file is part of the docs site's declared dependency
#          tree; safe to skip the build.
# Exit non-zero → at least one change is in a dep (or we couldn't tell).
#
# Same shape as editor/skip-build.sh — tool-agnostic, usable wherever a CI
# runner can branch on an exit code (Vercel ignoreCommand, GitHub Actions).
# The script itself knows nothing about the host.

# KNOWN CAVEAT: on fresh PR branches VERCEL_GIT_PREVIOUS_SHA is unset and the
# HEAD^ fallback sees only the tip commit — a docs-only tip commit wrongly
# skips the build. Planned fix: diff against the merge base with the target
# branch. (Vercel also runs its own "affected projects" check before this.)
set -uo pipefail

# ---------------------------------------------------------------------------
# DEPS — repo-relative patterns of paths the docs build consumes.
#
# The docs site is a Docusaurus project under apps/docs that sources its
# content from the repo-root docs/ tree (synced via the postinstall script
# in apps/docs/scripts/setup-docs.js). Nothing else in the workspace is
# pulled in.
#
# Pattern syntax (gitignore-like, evaluated by bash `case`):
#   "/foo"      → root-anchored: matches "foo" at repo root only
#   "foo/"      → directory subtree (the dir and everything inside)
#   "foo/bar"   → exact path match
#   "*.md"      → bash glob, matches anywhere in the tree
# ---------------------------------------------------------------------------
DEPS=(
  # the Docusaurus project itself
  "apps/docs/"

  # the content source that postinstall syncs into the site
  "docs/"

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
  echo "[skip-build] no changes in docs build deps — skipping."
  echo "$CHANGED" | sed 's/^/  /'
  exit 0
fi

echo "[skip-build] changes touch docs build deps — building."
printf '  %s\n' "${DEP_HITS[@]}"
exit 1
