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

# Commit range: from the previous built SHA when the host provides one, else
# from the merge base with the target branch — so a fresh PR branch is judged
# by all of its commits, not only its tip. (Vercel also runs its own
# "affected projects" check before this.)
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

# The branch a PR merges into. Its merge base with HEAD is the comparison
# point when no previous built SHA is known.
TARGET_BRANCH="${TARGET_BRANCH:-main}"
TARGET_REF="refs/remotes/origin/$TARGET_BRANCH"

# Fetch the target branch from origin into TARGET_REF, passing extra fetch
# options (e.g. --depth) through.
fetch_target() {
  git fetch --quiet --no-tags "$@" origin \
    "+refs/heads/$TARGET_BRANCH:$TARGET_REF" 2>/dev/null
}

# Print the merge base of HEAD and the target branch. Hosts such as Vercel
# check out a shallow clone without the target branch, so fetch it, then
# deepen both histories (up to ~1,000 commits) until they meet. Returns
# non-zero if the merge base cannot be found.
merge_base() {
  local shallow

  git merge-base HEAD "$TARGET_REF" 2>/dev/null && return 0

  shallow=$(git rev-parse --is-shallow-repository 2>/dev/null) || return 1
  if [ "$shallow" = true ]; then
    fetch_target --depth=50 || return 1
  else
    fetch_target || return 1
  fi
  git merge-base HEAD "$TARGET_REF" 2>/dev/null && return 0
  [ "$shallow" = true ] || return 1

  for _ in {1..10}; do
    fetch_target --deepen=100 || return 1
    git merge-base HEAD "$TARGET_REF" 2>/dev/null && return 0
  done
  return 1
}

# Compare against the previous deployed/built SHA when the host provides one
# (Vercel sets VERCEL_GIT_PREVIOUS_SHA), otherwise against the merge base with
# the target branch. If neither resolves, build to be safe.
BASE="${PREVIOUS_SHA:-${VERCEL_GIT_PREVIOUS_SHA:-}}"
if [ -z "$BASE" ]; then
  if ! BASE=$(merge_base); then
    echo "[skip-build] could not find the merge base with $TARGET_BRANCH — building."
    exit 1
  fi
  echo "[skip-build] comparing against the merge base with $TARGET_BRANCH ($BASE)."
fi

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
