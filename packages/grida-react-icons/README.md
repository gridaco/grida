# @grida/react-icons

> **Live:** [grida.co/ui/icons](https://grida.co/ui/icons) — every icon in
> the package, rendered. _Looking for the open-source icon search & API
> ([icons.grida.co](https://icons.grida.co))? That's a separate project —
> [gridaco/icons](https://github.com/gridaco/icons)._

Icons for building **expert editors and graphics-design tools** — the
genuine missing pieces that general icon sets don't ship: paint &
gradient types, blend modes, stroke endpoints/markers, vector-editing
affordances, filter effects, and the like.

**Think Radix Icons, not Lucide.** A focused, opinionated set scoped to a
domain — not a broad general-purpose library. If Lucide or Radix Icons
already ships a glyph, this package almost certainly shouldn't. Its reason
to exist is the iconography those libraries _leave out_.

**Shape only — zero runtime dependencies.** Every icon is a plain `<svg>` that
takes a `className`, colors itself with `currentColor`, and ships **no styling
and no state of its own**: no design tokens, no `active`/variant flags, no theme
logic. The consumer owns size, color, and state; the package owns the geometry.
Anything stateful or theme-aware — the paint swatches' active highlight, say —
lives in a **host wrapper**, never here (see _State & theme live in the host_).

> **Status: v0.0.0 — internal, unstable.** No second consumer has shaped
> the surface yet; names and structure may change without notice.
> `private: true` until the open questions below are settled (see
> _Known divergences_). The core design glyphs are now migrated — paint &
> gradient swatches, filter effects, blend mode, AI image tools, and
> tangent-mirroring modes (root), plus logos and the Grida mark (`/logos`).
> The stroke-decoration markers are the one set still held back (see
> _Irregular items_).

## Import paths

```tsx
// Core icons — the editor / graphics-design glyphs — from the root:
import {
  LinearGradientPaintIcon,
  BlendModeIcon,
  FeGlassIcon,
  MirroringAllIcon,
} from "@grida/react-icons";

// Logos (incl. the Grida mark) — ALWAYS behind the explicit /logos subpath:
import { GridaLogo, AppleLogo, SlackLogo } from "@grida/react-icons/logos";
```

The split is deliberate. Logos aren't part of the package's core identity,
so they never pollute the root namespace — you reach for them explicitly.

## What this package is for

The bar for the root namespace: **a glyph that expert design/editor tooling
needs and that the mainstream icon libraries don't provide.** Paint
swatches, gradient-type markers, blend-mode glyphs, stroke endpoints,
mirroring modes, filter effects — domain iconography, drawn once, shared.

## What does NOT belong

- **Restyles of general shapes.** A filled play/pause, a plain chevron, a
  gear — Lucide/Radix already ship these, so a custom-styled copy is a
  _duplicate_, not a missing piece.
  - **Exception — earned by reuse:** if such a glyph is genuinely shared
    (**≥2 call sites**) it may live here so the shared code has one home. A
    **one-off restyle stays at its single call site** and never earns a
    slot. _Example: the media play/pause glyphs are used in 3 places → kept;
    a glyph used once would not be._
- **Third-party-library wrappers** (Lucide / Radix) — restyle those in the
  app, not here. This package only holds icons Grida authored.
- **Name-registry dispatchers** — no `<Icon name="play" />` runtime lookup.
- **Theme-aware icons** — no design tokens, no CSS variables, no
  light/dark logic. An icon that needs the host's palette is coupled to the
  host; keep it there.
- **CSS-rendered swatches, illustrations / marketing art, app chrome**
  (cursors, gizmos, canvas-render geometry), **icon fonts / sprite sheets.**

## Logos — the exception

We _do_ ship brand & company logos, but only under
`@grida/react-icons/logos`, never the root. They're a convenience, not the
package's reason to exist. They also carry **third-party trademarks**,
which is the main reason the package stays `private` until publishing gets
legal review.

## The contract every icon obeys

The bar for admission. An icon that doesn't meet it doesn't belong here
(see _Irregular items_ for the ones held at the door).

1. **Renders real `<svg>`** — no `<div>`/CSS-background swatches, no `<img>`.
2. **Self-contained** — imports nothing but `react`; no `cn`/util imports,
   no sibling-module imports, no asset URLs.
3. **Color-agnostic** — `currentColor` for monochrome, fixed hex for brand
   marks. **No design tokens** (`fill-muted`, `var(--…)`, …). Theming is
   the consumer's job via `color`/`className`.
4. **Fixed square canvas** — a frozen `viewBox` is always set, so sizing is
   predictable and content edits never reflow call sites (see _SVG authoring_).
5. **Pure & portable** — no `"use client"`, no hooks, no globals; renders
   unchanged in RSC, the browser, a test runner.
6. **No state or app props** — accepts `className` + native SVG props, nothing
   else. **No `active`, no `selected`, no variant flags** — those are consumer
   state, and state is the consumer's job. A prop earns a slot only if it's
   intrinsic to the shape (`size`, `stroke`), never to how an app _uses_ it.
7. **camelCase SVG attributes** (`fillRule`, not `fill-rule`).

## State & theme live in the host

The package draws shapes; **it never knows whether it's "active", which theme is
on, or what an app does with it.** That keeps every icon trivially portable and
testable — and it's not optional, it's contract rules 3 & 6.

When an app needs a stateful or theme-coupled presentation, it writes a thin
**host wrapper** and keeps the coupling there:

```tsx
// editor host wrapper — owns the editor tokens + the active state
import { SolidPaintIcon as SolidPaintShape } from "@grida/react-icons";

export function SolidPaintIcon({ active, className }) {
  return (
    <SolidPaintShape
      className={cn(
        "rounded-full border shadow",
        active
          ? "text-workbench-accent-sky/50 border-workbench-accent-sky"
          : "text-muted border-border",
        className
      )}
    />
  );
}
```

The Grida editor does exactly this for the paint swatches and the blend-mode
glyph (`editor/scaffolds/sidecontrol/controls/icons/`): the package ships the
agnostic `currentColor` shape, the editor supplies the border ring (a CSS
`border`), the fill color (`currentColor` via `text-*`), and the `active`
highlight. Nothing editor-specific leaks into the package.

## Naming

A consumer picks an icon by reading its name, so **the name must disclose
every trait they'd choose on.** Be explicit, not terse.

`<Subject>[<Modifiers…>]Icon`

- **Subject** — what it depicts, in this package's domain vocabulary
  (`Play`, `Pause`, `Blend`, `Mirror`, `GradientLinear`, `StrokeArrow`) —
  not the editor feature that happens to use it.
- **Modifiers** — the visual traits a sibling could differ on, in a fixed
  order: **fill** (`Filled`) → **corner** (`Rounded` / `Sharp`) → weight /
  size / etc. The package's unmarked default is **sharp-cornered**; a rounded
  glyph **must** carry `Rounded` so it can never masquerade as the canonical
  form.
- **`Icon`** suffix — always.

> **A variant must never wear the canonical name.** `PauseFilledRoundedIcon`
> carries `Rounded` because it is rounded, while its sharp-cornered pair keeps
> the unmarked `PlayFilledIcon` — so the rounded one can never masquerade as
> the canonical form.

**Logos** use `<Brand>Logo` — no `Icon` suffix (a logo isn't a glyph):
`AppleLogo`, `GoogleLogo`, `SlackLogo`. When a brand ships more than one mark,
the variant is named, not numbered: `StripeBadgeLogo`, `StripeWordmarkLogo`.

## SVG authoring

The rules that let an icon's artwork change without breaking the apps that
render it.

### Canvas

- **Square, and one of two sizes.** Glyphs are authored on a square canvas.
  **15×15** is the default — the Radix convention, sized for editor /
  small-UI density. **24×24** is the alternative for general-purpose glyphs
  that read better larger. Pick one per icon and stay on it. _(Logos are the
  exception: native aspect ratio — but still a fixed `viewBox`.)_
- Always set `viewBox` **and** intrinsic `width`/`height`, so a `className`
  size (`size-4`, …) maps the artwork predictably.

### The canvas is the contract

The `<svg>` content **will** change — artwork gets retouched, a path
redrawn. That must **never** change how the icon occupies space at a call
site, because icon-swap layout regressions are effectively impossible to
unit-test.

- **The `viewBox` is frozen** per icon. Edit the artwork _inside_ it; never
  resize the box to fit new artwork.
- **Keep the visual footprint stable** — centered, same optical fill of the
  canvas — so a redraw doesn't shift or rescale the glyph anywhere.
- Treat the **box as the public contract** and the paths as private
  implementation. Review enforces "viewBox unchanged"; the renderer can't.

## Irregular items

Close, but **still held at the door** — admitted only once the condition is met.

| Item                          | Why it's irregular                                                                                 | Condition for admission                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Stroke-decoration markers** | import `@grida/cg` for `StrokeMarkerPreset`; composites use flex `<span>` layout, not pure `<svg>` | inline the union (or accept the `@grida/cg` dep) and split primitives from the flex composites |

The rest are now **in and shape-only.** `GridaLogo` ships under `/logos`
(`currentColor`; the editor re-applies `fill-foreground` in its adapter). The
editor / canvas-domain glyphs (`fe-*`, `BlendModeIcon`, `Mirroring*Icon`, the AI
image tools) and the paint swatches are all agnostic — the paint swatches' and
blend glyph's theme + active state moved out to host wrappers (see _State &
theme live in the host_), and the mirroring glyphs now default to `currentColor`
instead of a hardcoded grey.

## Known divergences

The set predates this doctrine; what's already migrated doesn't fully
conform yet, and is being reconciled:

- **`"use client"` (gradient swatches).** The linear, radial, and diamond
  swatches call `useId()` for collision-free gradient/clip ids, so they're
  client components (contract rule 5). Splitting one-icon-per-file keeps the
  directive scoped to **just those three** — solid, sweep, and image stay
  RSC-safe. Open follow-up: drop the hook.
- **Canvas.** Sizes are mixed: `fe-*` and `BlendModeIcon` sit on the standard
  15×15, but paint swatches are `16×16`, the AI image tools (`upscale`,
  `remove-background`) are `24×24`, mirroring is `64×64`, and the media pair
  isn't even square _or_ shared (`play` is `0 0 92.2 122.88`, `pause` is
  `0 0 47.6 47.6`). Normalize to 15×15 (or a deliberate, documented 24×24).

## Layout

```text
index.ts     root → core editor / graphics-design icons   import "@grida/react-icons"
logos.ts     →  src/logos                                  import "@grida/react-icons/logos"
src/
  *.tsx      core glyphs, one icon per file (default export), flat — e.g.
             play-filled, pause-filled-rounded, fe-noise, solid-paint,
             linear-gradient-paint, blend-mode, upscale, mirroring-all, …
  logos/     brand & company logos (incl. the Grida mark) — the one subfolder
```

**One icon per file, default export**, named in kebab-case with the
`Icon`/`Logo` suffix dropped from the filename (`solid-paint.tsx` →
`SolidPaintIcon`, `slack.tsx` → `SlackLogo`). The two entry barrels (`index.ts`,
`src/logos/index.ts`) re-export those defaults as **named exports**, so
consumers always `import { SolidPaintIcon }` — the file layout stays private.
The core icons are flat (no category subfolders); `logos/` is the one subfolder,
since it's a separate entry (`/logos`).

Built with `tsdown` in **unbundle** mode (one output file per source module) →
ESM + CJS + `.d.ts`. Unbundle lets a per-file `"use client"` survive: only the
three gradient swatches that call `useId()` (`linear-gradient-paint`,
`radial-gradient-paint`, `diamond-gradient-paint`) ship as client modules —
every other icon, the solid/sweep/image swatches included, stays RSC-safe.
One-icon-per-file is what makes that isolation possible: a bundled chunk would
have to drop the directive (those break in RSC) or hoist it to the whole entry
(the clean icons lose RSC rendering).

## Why these rules

An icon set is the easiest thing in a codebase to let rot — anyone can
paste an inline `<svg>` anywhere. A duplicate of a shape Lucide already has
adds weight without adding value; a theme-coupled icon can't be lifted out
of the host. The rules keep the set **scoped** (only what's genuinely
missing) and **portable** (self-contained, theme-free, real SVG), so it can
be published later without a per-icon audit.
