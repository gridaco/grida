#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY="gridaco/grida"
readonly CANONICAL_REPOSITORY_URL="https://github.com/gridaco/grida.git"

for command_name in gh git node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
cd "$repository_root"

latest_desktop_tag="$(
  gh release list \
    --repo "$REPOSITORY" \
    --exclude-drafts \
    --exclude-pre-releases \
    --limit 1 \
    --json tagName \
    --jq '.[0].tagName // empty'
)"
if [[ -z "$latest_desktop_tag" ]]; then
  echo "No published stable Desktop release found" >&2
  exit 1
fi

git fetch --quiet "$CANONICAL_REPOSITORY_URL" \
  "refs/tags/${latest_desktop_tag}"
baseline_commit="$(git rev-parse --verify 'FETCH_HEAD^{commit}')"

readonly -a release_paths=(
  .nvmrc
  .github/release-notes/desktop.md
  .github/scripts/assemble-desktop-release.mjs
  .github/scripts/assemble-desktop-release.test.mjs
  .github/workflows/realease-desktop-app.yml
  .github/workflows/verify-desktop-package.yml
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  turbo.json
  desktop
  skills
  packages/grida-ai-agent
  packages/grida-daemon
  packages/grida-ai-models
  packages/grida-desktop-bridge
  packages/grida-home
  editor/app/desktop
  editor/scaffolds/desktop
  editor/lib/agent-chat
  editor/lib/desktop
  editor/proxy.ts
)

echo "Latest published stable Desktop release: $latest_desktop_tag"
echo
echo "Release-scoped diff:"
release_diff="$(
  git diff --name-status "$baseline_commit" -- "${release_paths[@]}"
)"
if [[ -n "$release_diff" ]]; then
  echo "$release_diff"
else
  echo "(none)"
fi

echo
echo "Uncommitted release-scoped paths:"
worktree_diff="$(git status --short -- "${release_paths[@]}")"
if [[ -n "$worktree_diff" ]]; then
  echo "$worktree_diff"
else
  echo "(none)"
fi

current_desktop_version="$(
  node -p 'require("./desktop/package.json").version'
)"
release_endpoint="repos/${REPOSITORY}/releases/tags/v${current_desktop_version}"

echo
if release_json="$(
  gh api "$release_endpoint" \
    --jq '{tag_name,draft,prerelease,target_commitish,html_url}' 2>&1
)"; then
  echo "Current Desktop version release:"
  echo "$release_json"
elif [[ "$release_json" == *"(HTTP 404)"* ]]; then
  upstream_push_access="$(
    gh api "repos/${REPOSITORY}" --jq '.permissions.push // false'
  )"
  if [[ "$upstream_push_access" == "true" ]]; then
    echo "Current Desktop version release: unused (v${current_desktop_version})"
  else
    echo "Current Desktop version release: no published release visible"
    echo "Draft status: unknown without push access to ${REPOSITORY}"
  fi
else
  echo "$release_json" >&2
  exit 1
fi
