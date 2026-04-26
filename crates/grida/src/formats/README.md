# `formats/`

**Purpose: format-specific utilities.**

A home for self-contained tooling around individual third-party formats.
Each module here is committed to a single rule:

> No `grida` / Grida types in or out.

Inputs and outputs are limited to the format itself, or to a neutral
parser tree owned by an external crate. The moment a function returns a
`SceneGraph`, a `Scene`, an `IRSVG*` node, or `.grida` bytes, it has
crossed into [`../import/`](../import/) and does not belong here.

## Why this tier exists

Format-internal utilities — sanitizers, optimizers, parsers,
format↔format converters — share a property that makes them awkward to
mix with import or render code: they have no opinion about Grida's data
model. Grouping them under `formats/` keeps three boundaries honest:

- `formats/` — touches only the format
- [`../import/`](../import/) — converts external formats _into_ Grida
- [`../htmlcss/`](../htmlcss/) (and other renderers) — produces pixels

A function should pick exactly one of those homes. If it spans two,
split it.

## Where things go

When adding a new helper, ask in order:

1. Does it return or take any `grida::*` type, `Scene`, `SceneGraph`,
   `Node`, or `.grida` bytes? → [`../import/`](../import/) or
   [`../export/`](../export/).
2. Does it produce a `skia_safe::Picture` or otherwise drive rendering?
   → a renderer module (e.g. [`../htmlcss/`](../htmlcss/)).
3. Otherwise — pure format-in / format-out, or format → standard parser
   tree → here.

## Layout convention

Every supported format is a sub-directory, even when it currently holds
only one file. Uniform shape across `formats/<fmt>/`,
`import/<fmt>/`, and (eventually) sibling tiers makes the tree
predictable and gives each format room to grow without later
re-shuffles.

## Promotion path

Modules under `formats/` are good candidates for eventual promotion to
their own workspace crates. Keep them narrow, dependency-light, and
Grida-free so that promotion stays cheap — the directory boundary today
previews a possible crate boundary tomorrow (cf.
[`crates/fonts`](../../../fonts), a format-internal toolkit that started
life as a sub-module).
