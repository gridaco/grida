# Patches

This file tracks the upstream sync state of the vendored `usvg` source.

## Fork Base

Initially forked from upstream commit [`0ecb332e`](https://github.com/linebender/resvg/commit/0ecb332e51360ed59da2c0e5b1167311f77cac8a) (linebender/resvg, 2025-10-29) — pre-harfrust, pre-edition-2024, with `kurbo 0.12` / `svgtypes 0.16`.

## Last Synced

Upstream: [`b3c7f58d`](https://github.com/linebender/resvg/commit/b3c7f58d059da6aa0a25141b1948c61b8c579c12) (linebender/resvg, 2026-04-09).

## Adopted Upstream Patches

Cherry-picked from `0ecb332e..b3c7f58d` via `git format-patch` + `git am`. `Cargo.toml`, `tests/`, and dep/edition/MSRV bumps were intentionally excluded.

| PR                                                     | Summary                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [#980](https://github.com/linebender/resvg/pull/980)   | feat: do not write empty `defs` nodes                       |
| [#981](https://github.com/linebender/resvg/pull/981)   | check if text paths need to be written out                  |
| [#984](https://github.com/linebender/resvg/pull/984)   | consolidate `BlendMode::to_string`                          |
| [#988](https://github.com/linebender/resvg/pull/988)   | fix bug in rewriting of clip paths with transformed path    |
| [#994](https://github.com/linebender/resvg/pull/994)   | don't emit warning for certain attributes with value `none` |
| [#1040](https://github.com/linebender/resvg/pull/1040) | fix: text nodes should inherit absolute transform           |
| [#1043](https://github.com/linebender/resvg/pull/1043) | correctly calculate glyph advances                          |

## Local Modifications

Changes made in the fork that are not from upstream:

- `src/lib.rs`, `src/main.rs` — fork note + `#![allow(clippy::all)]`
- `src/text/mod.rs` — `flatten` is treated as optional; the text node is preserved even when outlining fails
- `tests/files/text-simple-case-expected.svg` and related — snapshot regenerated locally

## How to Sync

```sh
# In a local clone of linebender/resvg:
git format-patch <last-synced>..main -o /tmp/usvg-patches \
  -- crates/usvg/src crates/usvg/codegen

# In this repo, rewrite paths and apply:
for p in /tmp/usvg-patches/*.patch; do
  sed -i '' 's| a/crates/usvg/| a/third_party/usvg/|g; s| b/crates/usvg/| b/third_party/usvg/|g; s|^--- a/crates/usvg/|--- a/third_party/usvg/|g; s|^+++ b/crates/usvg/|+++ b/third_party/usvg/|g' "$p"
  git am "$p"
done
```

After syncing, update **Last Synced** above and append the new PRs to **Adopted Upstream Patches**.
