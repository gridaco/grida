#!/usr/bin/env bash
# Decide whether the editor build can be skipped for the current commit range.
#
# Exit 0 → no changed file is part of the editor's declared dependency tree;
#          safe to skip the build.
# Exit non-zero → at least one change is in a dep (or we couldn't tell).
#
# Tool-agnostic: usable wherever a CI runner can branch on an exit code
# (Vercel ignoreCommand, GitHub Actions, etc.). The script itself knows
# nothing about the host.
#
# Strategy: ALLOWLIST of known build dependencies, derived from
# pnpm-workspace.yaml + editor/package.json (workspace:* deps) + turbo.json.
# An entry MISSING from this list means real changes won't trigger a deploy
# — keep it correct as the workspace topology evolves.

set -uo pipefail

# ---------------------------------------------------------------------------
# DEPS — repo-relative patterns of paths the editor build consumes.
#
# Pattern syntax (gitignore-like, evaluated by bash `case`):
#   "/foo"      → root-anchored: matches "foo" at repo root only
#                 e.g. "/package.json" excludes "apps/x/package.json"
#   "foo/"      → directory subtree (the dir and everything inside)
#                 e.g. "packages/" matches "packages/grida-bitmap/src/x.ts"
#   "foo/bar"   → exact path match
#   "*.md"      → bash glob, matches anywhere in the tree
#
# Add or remove entries freely. Order does not matter.
# ---------------------------------------------------------------------------
DEPS=(
  # workspace packages consumed by the editor (direct or transitive)
  "editor/"
  "database/"             # @app/database
  "packages/"             # most @grida/* deps
  "crates/grida-canvas-wasm/"  # @grida/canvas-wasm (lives under crates/)

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
        # root-anchored exact
        case "$f" in "${p#/}") return 0 ;; esac
        ;;
      */)
        # directory subtree (prefix match)
        case "$f" in "$p"*) return 0 ;; esac
        ;;
      *)
        # glob (right-hand side intentionally unquoted)
        # shellcheck disable=SC2254
        case "$f" in $p) return 0 ;; esac
        ;;
    esac
  done
  return 1
}

# Compare against the previous deployed/built SHA when the host provides one
# (Vercel sets VERCEL_GIT_PREVIOUS_SHA), otherwise fall back to the parent
# commit. If neither resolves, build to be safe.
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
  echo "[skip-build] no changes in editor build deps — skipping."
  echo "$CHANGED" | sed 's/^/  /'
  exit 0
fi

echo "[skip-build] changes touch editor build deps — building."
printf '  %s\n' "${DEP_HITS[@]}"
exit 1
