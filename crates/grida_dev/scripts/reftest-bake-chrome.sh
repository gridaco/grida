#!/usr/bin/env bash
# Thin wrapper around `cargo run -p grida_dev -- reftest bake`.
# Forwards all args, so e.g.:
#   reftest-bake-chrome.sh --filter masking/clipPath --concurrency 8
exec cargo run --release -p grida_dev -- reftest bake "$@"
