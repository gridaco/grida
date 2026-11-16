#!/usr/bin/env bash
# Run Grida Desktop against local services with one command.
# Starts local Supabase and the editor dev server when they are not already
# running, then launches the development Desktop app. Services this script
# started are stopped when Desktop exits.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
editor_url="http://localhost:3000"
log_dir="${TMPDIR:-/tmp}/grida-desktop-local"
mkdir -p "$log_dir"

step() { printf '\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f editor/.env.local ] ||
  fail "editor/.env.local is missing. See CONTRIBUTING.md#authenticated-local-development."
grep -Eq "^NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH=['\"]?1['\"]?\s*$" editor/.env.local ||
  printf 'note: NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH=1 is not set in editor/.env.local; sign-in uses the configured project.\n'

if [ ! -d node_modules ]; then
  step "Installing dependencies"
  pnpm install
fi

if grep -q '127.0.0.1:54321\|localhost:54321' editor/.env.local; then
  if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:54321/auth/v1/health; then
    step "Local Supabase is running"
  else
    command -v supabase >/dev/null || fail "Local Supabase is not running and the supabase CLI is not installed."
    step "Starting local Supabase"
    supabase start >"$log_dir/supabase.log" 2>&1 ||
      fail "supabase start failed. See $log_dir/supabase.log"
  fi
fi

editor_pid=""
cleanup() {
  if [ -n "$editor_pid" ] && kill -0 "$editor_pid" 2>/dev/null; then
    step "Stopping the editor dev server"
    kill "$editor_pid" 2>/dev/null || true
    wait "$editor_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if curl -fsS -o /dev/null --max-time 2 "$editor_url/desktop/auth/me" 2>/dev/null ||
   curl -fsS -o /dev/null --max-time 2 "$editor_url" 2>/dev/null; then
  step "Editor dev server is already running at $editor_url"
else
  lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 &&
    fail "Port 3000 is in use by something other than the editor. Free it and retry."
  step "Starting the editor dev server (log: $log_dir/editor.log)"
  pnpm --filter editor dev >"$log_dir/editor.log" 2>&1 &
  editor_pid=$!
  for _ in $(seq 1 180); do
    kill -0 "$editor_pid" 2>/dev/null ||
      fail "The editor dev server exited. See $log_dir/editor.log"
    curl -fsS -o /dev/null --max-time 2 "$editor_url" 2>/dev/null && break
    sleep 1
  done
  curl -fsS -o /dev/null --max-time 2 "$editor_url" 2>/dev/null ||
    fail "The editor dev server did not start. See $log_dir/editor.log"
  step "Warming the Desktop routes"
  curl -fsS -o /dev/null --max-time 300 "$editor_url/desktop/welcome" 2>/dev/null || true
  curl -fsS -o /dev/null --max-time 300 "$editor_url/desktop/workspace" 2>/dev/null || true
fi

step "Starting Grida Desktop (builds linked packages and the native agent first)"
pnpm --dir desktop dev
