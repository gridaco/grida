# Naming — Cases and Tables

Supplementary to [`SKILL.md`](SKILL.md). Load only when you need concrete
mappings, the short-name charter, or the unresolved questions.

## Crate directory vs. Cargo `name`

| Directory                   | `name`              | Rationale                                         |
| --------------------------- | ------------------- | ------------------------------------------------- |
| `crates/grida-canvas`       | `cg`                | Heavily imported; short name pays off everywhere. |
| `crates/grida-canvas-fonts` | `fonts`             | Scoped under `grida-canvas`; `fonts` is clear.    |
| `crates/grida-canvas-wasm`  | `grida-canvas-wasm` | Published artifact; full name is its API.         |
| `crates/math2`              | `math2`             | No browse-breadcrumb to leverage — align.         |
| `crates/csscascade`         | `csscascade`        | Same.                                             |

## Package directory vs. `package.json` `name`

| Directory                        | `name`               |
| -------------------------------- | -------------------- |
| `packages/grida-canvas-cg`       | `@grida/cg`          |
| `packages/grida-canvas-hud`      | `@grida/hud`         |
| `packages/grida-canvas-io`       | `@grida/io`          |
| `packages/grida-canvas-io-figma` | `@grida/io-figma`    |
| `packages/grida-canvas-tailwind` | `@grida/tailwindcss` |
| `packages/grida-cmath`           | `@grida/cmath`       |
| `packages/grida-reftest`         | `@grida/reftest`     |
| `packages/react-p-queue`         | `react-p-queue`      |

## Route group charter (`editor/app/(*)/`)

| Group         | Audience / surface                                 |
| ------------- | -------------------------------------------------- |
| `(www)`       | Public, SEO landing                                |
| `(site)`      | Public, non-SEO                                    |
| `(auth)`      | Auth flow (don't modify without reason)            |
| `(workbench)` | The editor itself                                  |
| `(workspace)` | Dashboard around the editor                        |
| `(tenant)`    | Tenant-site rendering (`*.grida.site`)             |
| `(tools)`     | Standalone tools / playgrounds                     |
| `(preview)`   | Embed preview slave pages                          |
| `(insiders)`  | Local-only routes                                  |
| `(api)`       | API routes (with `public/` / `private/` sub-split) |

Adding a new group: pick it because a new _reader_ exists, not because a
new feature exists.

## Blessed short names

Accept without prefix, because each is the sole occupant of its concept
slot in its parent:

- Rust modules: `cg`, `fe`, `sk`, `sk_tiny`, `sys`, `os`, `k`
- TS dirs: `k/` (constants), `q/` (query), `lib/`, `utils/`, `hooks/`,
  `types/`, `theme/`

Don't introduce a new two-letter directory unless it truly has no peer
that could be confused with it.

## Variant suffixes (Rust)

Prefer `<root>.rs` + `<root>_<qualifier>.rs` over a new subdirectory when
the group is small:

```text
painter/
  painter.rs
  painter_debug_node.rs
  effects.rs
  effects_noise.rs
  image.rs
  image_filters.rs
```

Counter-example: `painter2.rs` ❌ (version-as-suffix is not arity).

## Test filename examples

- `canvas-input-history-rapid-change-bucketing.md`
- `canvas-resize-vector-aspect-ratio.md`
- `canvas-overlay-frame-title-bar-z-order.md`

## Open questions

- **Promotion path.** When does an `editor/grida-*` module graduate to
  `packages/grida-*`? Any signal besides "feels stable"?
- **Short-name charter.** Freeze the blessed list above, or keep it open
  to taste?
- **Pluralization.** `fonts/` (collection) vs `font-manager.ts` (single
  coordinator) vs `@grida/fonts` (package) — working rule, or sharpen?
- **Test filename depth.** Six segments still readable; is there a
  ceiling before we must nest?
- **`x-` prefix.** Currently only `scaffolds/x-supabase/`. Extend to
  other cross-cutting areas, or leave one-off?
