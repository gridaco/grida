# `public/slides-templates` — a publishing unit

Curated, bundled **slide-deck templates** for the desktop home's `slides`
preset. Each entry under `decks/` is a real
[`dotcanvas`](../../packages/dotcanvas) `.canvas` bundle — a `.canvas.json`
manifest plus flat, zero-padded `NNN.svg` slide documents (16:9,
`viewBox="0 0 1920 1080"`), authored to the agent's `slides` skill contract
([`skills/slides`](../../skills/slides)).

This directory is a **publishing unit** of the [`public/` origin
tree](../README.md): `decks/` is the committed source of truth,
[`build.mjs`](./build.mjs) zips each deck deterministically into `out/`
(gitignored), and [`publish.json`](./publish.json) maps the zips to
`/templates/slides/…` on grida.co. The manifest's
`ext["co.grida.templates"]` carries each deck's display `title`, `system`,
`activeId` (opening slide), and the composer seed `prompt`.

## The starter set

Six decks, each a distinct **communication job × visual system** — so the set
covers six audiences and six looks with no redundancy.

| Bundle                    | Job                             | Visual system                                                               | Slides |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------- | ------ |
| `topic-explainer.canvas`  | Teach / present anything        | **Whitepaper** — ink-on-paper minimal, one signal-red accent                | 9      |
| `startup-pitch.canvas`    | Raise money                     | **Obsidian** — near-black + gold, serif headings                            | 12     |
| `product-launch.canvas`   | Announce & drive adoption       | **Riso** — electric flats, oversized type, color blocks                     | 9      |
| `workshop-session.canvas` | Facilitate a group session      | **Studio** — soft pastels, rounded cards, squiggle accents                  | 9      |
| `product-showcase.canvas` | Show a product / feature set    | **Bento** — dark canvas, filled bento grid of type + stats + UI screenshots | 8      |
| `portfolio.canvas`        | Land a job (student / new-grad) | **Marque** — bold personal-brand: bone + one persimmon accent, huge type    | 9      |

## Visual systems

Each deck holds ONE system across every slide. The systems are intentionally
far apart in the style space (minimal · dark-premium · corporate · expressive ·
soft-human).

| System         | Palette (core hexes)                                                                                                                                                            | Type                              | Accent language                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whitepaper** | paper `#FAFAF8`, ink `#111111`, muted `#8A8A82`, red `#E5484D`                                                                                                                  | Inter/Helvetica, weight-driven    | one 2px rule, one red mark per slide                                                                                                                                      |
| **obsidian**   | black `#0A0A0B`, gold `#C9A227`, off-white `#EDEAE3`                                                                                                                            | Playfair serif + Inter body       | gold hairlines, small-caps labels, faint watermark numbers                                                                                                                |
| **riso**       | blue `#2323FF`, pink `#FF3D7F`, yellow `#F2FF49`, paper `#F7F5EF`, black `#0D0D0D`                                                                                              | Space Grotesk, huge tight-tracked | full-bleed color blocks, thick rules, halftone dots                                                                                                                       |
| **studio**     | blush `#F6D8D2`, sky `#CFE3EC`, butter `#F3E7C4`, sage `#D5E0CE`, ink `#3A3A3A`, coral `#EF7A6D`                                                                                | Poppins + Nunito Sans             | rounded cards, squiggle underlines, soft blobs                                                                                                                            |
| **bento**      | warm near-black `#161513`; **neutrals lead** — cream `#EFEBE2`, dark card `#201F1C`; muted accents used 1–2×/slide — terracotta `#DE7A5C`, sage `#AFC17C`, periwinkle `#8E93D6` | Inter Tight + Inter               | bento grid, one clear hero per slide; every cell is **filled** — large centred type, a big stat, or a drawn product-UI screenshot (no placeholders, no decorative filler) |
| **marque**     | bone `#ECE8DF`, ink `#191612`, dark card `#1B1A17`; ONE bold signature accent (default persimmon `#FF5233`, the swappable "brand color")                                        | Inter Tight, huge                 | bold personal-brand: accent-field cover/close with a huge name + monogram; content is neutrals + one accent pop; drawn work-sample thumbnails                             |

Fonts are declared as graceful stacks (e.g. `"Playfair Display",Georgia,serif`)
so a slide degrades to a system face where the web font is absent.

### The `marque` visual system (Portfolio)

`marque` is the personal-brand system for a **student / new-grad Portfolio** —
projects, coursework, internships, skills, "here's what I've built." It differs
from Riso (three clashing flats) by being **single-accent + whitespace-led**: the
cover and closing "let's connect" are full **accent fields** with a huge name and
an initials monogram (the personal-brand punch), while content slides are bone
with the accent popping once or twice (project numbers, a key stat). Same finished
discipline as `bento` — type fills its cell, no empty placeholders; the project
"work" slots are **drawn work-sample thumbnails** (UI / chart / photo-grid /
poster), swappable for real images.

### The `bento` visual system

`bento` is the image-forward system, modelled on an editorial bento reference:
the design is carried by **neutrals (cream + dark cards) and bold type on a warm
dark canvas**, with a muted accent (terracotta / sage / periwinkle) popping only
once or twice per slide and one clear hero per slide.

It's authored as a **finished** deck, not a wireframe. Two composition rules keep
it from reading as empty boxes: **(1)** headline type is large and vertically
centred so it _fills_ its cell (small top-left text stranded in a big cell is the
"unfinished" tell); **(2)** there is **no decorative filler** — every cell is
large type, a big stat, or a drawn product-UI "screenshot" (`dashboard` /
`editor` / `board` / `chart` / `list`), all pure SVG (no external assets, no
gradients, no embedded raster), with confident copy and no "drop image" tells.
The whole deck is assembled by a companion generator (`gen-bento.mjs`, kept
out-of-tree in the authoring scratch) so it stays regenerable.

> To place a real photo in a slot, embed it as a **`data:` URI**, not a relative
> `href`: a slide SVG gets inlined into the editor DOM, where a relative ref
> resolves against the app origin and breaks, while a `data:` URI renders
> everywhere. Whether an `<image>` node imports into the canvas node-tree is a
> separate check for when the registry is wired.

## Authoring conventions (shared across all decks)

Hold these so a new deck reads as a sibling, not a stray:

- **Frame** — every slide is a standalone SVG, first child `<title>` (its deck
  name), then a full-bleed background `<rect>`. Same `1920×1080` viewBox.
- **Safe margins** — content lives in `x160 → x1760`. Only intentional
  full-bleed color blocks (Riso) touch the frame edge.
- **One idea per slide**, one dominant anchor, repeated title Y-position.
- **Footer** — every non-cover slide: a hairline rule at `y=980` (`x160→x1760`),
  running deck title bottom-left, `0N / TT` page number bottom-right. Covers use
  their own footer (brand · year).
- **Safe primitives only** — rect (incl. `rx`), text/tspan, circle/ellipse,
  line/polyline/path, gradients & patterns in `<defs>`. A simple vector bar
  chart (≤6 pre-normalized bars) is fine. No dense tables, connector timelines,
  multi-series charts, icon fonts, or external images.
- **Caps** — bullets ≤5, stat/KPI blocks 1–4, chart bars ≤6.
- **Copy** — realistic, obviously-**replaceable** placeholder that demonstrates
  each beat (not lorem, not private data). Numbers are swappable placeholders.

## Previewing / verifying a deck

Slides are self-contained SVG, so any SVG rasterizer renders them. To eyeball a
whole bundle as a contact sheet (requires `rsvg-convert` + ImageMagick):

```sh
cd decks/topic-explainer.canvas
for f in 0*.svg; do rsvg-convert -w 640 -h 360 "$f" -o "/tmp/${f%.svg}.png"; done
magick montage /tmp/0*.png -tile 3x3 -geometry +12+12 -background "#e8e8e8" /tmp/sheet.png
```

`rsvg-convert` uses locally-installed fonts, so web-only faces (Space Grotesk,
Poppins, Inter Tight…) fall back to a system face in the preview — the editor
renders the intended face.
