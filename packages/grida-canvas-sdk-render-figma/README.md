<!--
NOTE: This README is for a planned module. Treat APIs and names as subject to change.
-->

# `@grida/refig` (planned)

> **re**: render, **fig**: figma → **refig** (in the spirit of `resvg`)

Headless Figma renderer for **pixel-perfect exports** without Figma Desktop and without a browser.

This package takes a Figma document file (`.fig`), converts it into **Grida IR**, then renders via the Grida Canvas runtime while preserving core properties (layout, constraints, images, etc.). The goal is to make “render this Figma node at this viewport size” deterministic and CI-friendly.

## Status

- **WIP / planned**: API shape, feature set, and package name may change.

## Features

- **Multiple output formats**: `png`, `jpeg`, `webp`, `pdf`, `svg`
- **`.fig` file input**: render from an exported `.fig` without waiting on API calls
- **CI-friendly**: runs headlessly (no browser / no Figma Desktop)
- **Layout-aware rendering**: render responsive designs at arbitrary viewport sizes (within supported Figma semantics)

## Use cases

- **Research / studies**: reproducible rendering for datasets that rely heavily on Figma
- **Design-as-input pipelines**: build apps that consume Figma but need high-fidelity raster/vector output
- **Post-processing**: render then run your own pixel pipeline (filters, analysis, diffing, etc.)

## Who is this for?

- People who want **rendered output** (images / PDFs / SVGs) from Figma sources in a headless environment
- Teams who need **repeatable rendering in CI** (snapshot tests, design regression tests, batch export)

## Who is this NOT for?

- **Design-to-code conversion**: if you want HTML/CSS, Flutter widgets, etc., this is not the right tool
- **Authoring / editing Figma**: this module is intended for **reading + rendering**, not programmatically creating or modifying designs
- **“Just export images from the Figma API”**: if you already have Figma API access, the Images API is usually the simplest solution. `.fig`-based rendering is intended for headless, reproducible exports when you don’t want to depend on the API at render time.

## Getting started

> The API below reflects the current draft and may change.

### Install

```sh
pnpm add @grida/refig
```

> If the package is not yet published, you can depend on the workspace version from this repo.

### Render from a `.fig` file

```ts
import { writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

// Input from a local `.fig` file
const document = new FigmaDocument("path/to/file.fig");

const renderer = new FigmaRenderer(document, {
  // When enabled, the renderer may download fonts (network access required).
  // Alternative strategies (e.g. local font dirs) may be supported later.
  useGoogleFonts: true,
});

const { data } = await renderer.render("<node-id>", {
  format: "png",
  scale: 1,
  width: 1024,
  height: 1024,

  // Toggle which parts of the pipeline run (names may change).
  layout: true,
  images: true,
});

writeFileSync("out.png", data);
```

## CLI

> Planned. The exact command name / flags may change.

### Install (optional, for `refig` command)

```sh
pnpm add -g @grida/refig
```

### Render a node from a `.fig` file

```sh
refig ./path/to/file.fig \
  --node "<node-id>" \
  --out ./out.png \
  --format png \
  --width 1024 \
  --height 1024 \
  --scale 1
```

### No-install (one-off / CI)

```sh
pnpm dlx @grida/refig ./path/to/file.fig \
  --node "<node-id>" \
  --out ./out.png \
  --format png \
  --width 1024 \
  --height 1024 \
  --scale 1
```

### Common flags (draft)

- **`--node`**: node id to render
- **`--out`**: output file path
- **`--format`**: `png | jpeg | webp | pdf | svg`
- **`--width` / `--height`**: viewport size (optional; affects layout)
- **`--scale`**: raster scale factor (optional; default `1`)
- **`--fonts`**: font strategy (e.g. `google`, `local:<dir>`) (planned)

## Rendering notes

- **Node selection**: you render a specific node (frame/component/group/etc.) by node id.
- **Viewport**: you can control output dimensions (`width` / `height`) to test responsive constraints.
- **Fonts**: Figma fidelity depends on available fonts. If fonts aren’t resolvable, output may differ.

## Roadmap (non-binding)

- Better font resolution strategies (local font dirs, explicit font mapping, caching)
- More complete Figma feature coverage (effects, text shaping edge cases, vectors)
- Stable, documented API surface + versioned compatibility guarantees

## Not planned

- **Figma API response ingestion**: if you have API access, you can typically use Figma’s Images API directly. This project focuses on `.fig` inputs and headless rendering.

## FAQ

### Are other languages supported besides Node.js (TS/JS)?

No. The intended surface is **Node.js (TypeScript/JavaScript)**.

We intentionally keep the generic renderer in WASM, while the Figma → Grida conversion pipeline stays in JS to avoid shipping a much larger binary and to keep iteration fast.

## License

See the repository [`LICENSE`](../../LICENSE).
