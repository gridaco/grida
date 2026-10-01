#!/bin/sh
# GRIDA-SEC-010: run inside a disposable Linux container or CI user session.
# Requires Node 24, the pinned Rust toolchain, dbus-run-session, gnome-keyring,
# and a Linux build of @github/keytar. Never mounts a host credential directory.
set -eu
test "$(uname -s)" = Linux
fixture_root=$(mktemp -d)
trap 'rm -rf "$fixture_root"' EXIT HUP INT TERM
export XDG_DATA_HOME="$fixture_root/data"
export XDG_CONFIG_HOME="$fixture_root/config"
export XDG_CACHE_HOME="$fixture_root/cache"
export XDG_RUNTIME_DIR="$fixture_root/runtime"
mkdir -m 700 -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
dbus-run-session -- sh -eu -c '
  printf "%s" synthetic-fixture-password | gnome-keyring-daemon --unlock --components=secrets >/dev/null
  node --test scripts/conformance/auth-keyring.test.mjs
'
