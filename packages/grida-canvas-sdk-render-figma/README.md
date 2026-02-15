# `@grida/refig`

> **re**nder **fig**ma — headless Figma renderer in the spirit of [`resvg`](https://github.com/nicolo-ribaudo/resvg-js)

Render Figma documents to **PNG, JPEG, WebP, PDF, and SVG** without Figma Desktop and without a browser.

Pass a `.fig` file or a Figma REST API JSON response, pick a node, get pixels.

## Install

```sh
pnpm add @grida/refig
```

## Entrypoints

| Import                 | Environment | Notes                                                                     |
| ---------------------- | ----------- | ------------------------------------------------------------------------- |
| `@grida/refig`         | **Node.js** | Default. Includes `fs` helpers for reading `.fig` / JSON files from disk. |
| `@grida/refig/browser` | **Browser** | No `node:fs` dependency. Accepts `Uint8Array` and JSON objects only.      |

Both entrypoints export the same core API (`FigmaDocument`, `FigmaRenderer`, types). The only difference is that the Node entrypoint adds a convenience `FigmaDocument.fromFile(path)` static method.

## Quick start (Node)

### Render from a `.fig` file

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

const doc = FigmaDocument.fromFile("path/to/file.fig");
const renderer = new FigmaRenderer(doc);

const { data } = await renderer.render("<node-id>", {
  format: "png",
  width: 1024,
  height: 1024,
  scale: 2,
});

writeFileSync("out.png", data);
renderer.dispose();
```

### Render from Figma REST API JSON

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

// GET /v1/files/:key — fetched by your own client
const json = JSON.parse(readFileSync("figma-response.json", "utf-8"));

const renderer = new FigmaRenderer(new FigmaDocument(json));

const { data } = await renderer.render("<node-id>", {
  format: "svg",
});

writeFileSync("out.svg", data);
renderer.dispose();
```

> Fetching / authentication is intentionally out of scope. Provide the document data from your own API layer.

## Quick start (Browser)

```ts
import { FigmaDocument, FigmaRenderer } from "@grida/refig/browser";

// Uint8Array from a File input, fetch(), or drag-and-drop
const figBytes: Uint8Array = await file
  .arrayBuffer()
  .then((b) => new Uint8Array(b));

const renderer = new FigmaRenderer(new FigmaDocument(figBytes));

const { data } = await renderer.render("<node-id>", {
  format: "png",
  width: 512,
  height: 512,
});

// data is a Uint8Array — display it, upload it, etc.
const blob = new Blob([data], { type: "image/png" });
renderer.dispose();
```

## API

### `FigmaDocument`

```ts
// From raw .fig bytes (Node + Browser)
new FigmaDocument(figBytes: Uint8Array)

// From Figma REST API JSON (Node + Browser)
new FigmaDocument(json: Record<string, unknown>)

// From a file path (Node only — @grida/refig)
FigmaDocument.fromFile("path/to/file.fig")   // .fig binary
FigmaDocument.fromFile("path/to/doc.json")   // REST API JSON
```

### `FigmaRenderer`

```ts
const renderer = new FigmaRenderer(document: FigmaDocument, options?: {
  useEmbeddedFonts?: boolean;  // default: true
});

const result = await renderer.render(nodeId: string, {
  format: "png" | "jpeg" | "webp" | "pdf" | "svg";
  width?: number;   // default: 1024
  height?: number;  // default: 1024
  scale?: number;   // default: 1
});

// result.data  — Uint8Array (encoded image / document bytes)
// result.format
// result.mimeType
// result.nodeId
// result.width
// result.height

renderer.dispose();  // release WASM resources
```

### `RefigRenderResult`

```ts
interface RefigRenderResult {
  data: Uint8Array;
  format: "png" | "jpeg" | "webp" | "pdf" | "svg";
  mimeType: string;
  nodeId: string;
  width: number;
  height: number;
}
```

## CLI

### Install

```sh
pnpm add -g @grida/refig
```

### Usage

```sh
# Single node (default)
refig <input> --node <node-id> --out <path> [options]

# Export all nodes that have exportSettings (REST JSON only)
refig <input> --export-all --out <output-dir>
```

### Examples

```sh
# Render a node from a .fig file
refig ./design.fig --node "1:23" --out ./out.png

# Render from REST API JSON
refig ./figma-response.json --node "1:23" --out ./out.svg

# Export all: render every node that has export settings (see below)
refig ./figma-response.json --export-all --out ./exports

# Scale 2x, custom dimensions
refig ./design.fig --node "1:23" --out ./out.png --width 512 --height 512 --scale 2

# No-install (CI one-liner)
pnpm dlx @grida/refig ./design.fig --node "1:23" --out ./out.png
```

### Export all (`--export-all`)

With **`--export-all`**, refig walks the document and renders every node that has [Figma export settings](https://www.figma.com/developers/api#exportsetting-type) — one file per (node, setting), using that setting’s format, suffix, and constraint. **REST API JSON only** (e.g. `GET /v1/files/:key`); `.fig` does not include export settings.

**When it’s useful:** You choose in Figma exactly what to export: select a node, click **Export +** in the right panel, add one or more presets (e.g. PNG @2x, SVG). Add exports on as many nodes as you want. Then run the CLI with `--export-all` and the path to your REST JSON; refig renders all of those with the same config, without long or repeated `--node` / `--format` / `--scale` options. Same idea for testing the renderer: add export presets on the nodes you care about in Figma, run `refig … --export-all --out ./out`, and compare outputs.

### Flags

| Flag             | Required | Default                         | Description                                                                   |
| ---------------- | -------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `<input>`        | yes      |                                 | Path to `.fig` file or JSON file                                              |
| `--node <id>`    | yes\*    |                                 | Figma node ID to render (\*omit when using `--export-all`)                    |
| `--out <path>`   | yes      |                                 | Output file path (single node) or output directory (`--export-all`)           |
| `--export-all`   | no       |                                 | Export every node with exportSettings; REST JSON only; `--out` is a directory |
| `--format <fmt>` | no       | inferred from `--out` extension | `png`, `jpeg`, `webp`, `pdf`, `svg` (single-node only)                        |
| `--width <px>`   | no       | `1024`                          | Viewport width (single-node only)                                             |
| `--height <px>`  | no       | `1024`                          | Viewport height (single-node only)                                            |
| `--scale <n>`    | no       | `1`                             | Raster scale factor (single-node only)                                        |

## Architecture

```
Input                    Conversion                    Rendering
─────                    ──────────                    ─────────
.fig bytes ──┐
             ├──→ @grida/io-figma ──→ Grida IR ──→ @grida/canvas-wasm ──→ PNG/JPEG/WebP/PDF/SVG
REST JSON ───┘
```

- **`@grida/io-figma`** converts Figma data (`.fig` Kiwi binary or REST API JSON) into Grida's intermediate representation
- **`@grida/canvas-wasm`** renders the IR via Skia (raster backend for headless, WebGL for browser)
- **`@grida/refig`** ties them together behind a simple `render(nodeId, options)` call

## Features

- **Multiple output formats** — `png`, `jpeg`, `webp`, `pdf`, `svg`
- **`.fig` file input** — render from exported `.fig` without API calls
- **REST API JSON input** — render from document JSON you already have
- **CI-friendly** — headless, deterministic, no browser required
- **Browser-compatible** — `@grida/refig/browser` works in any modern browser
- **WASM-powered** — Skia-backed rendering for pixel-accurate output

## Not planned

- **Figma API fetching / auth** — bring your own tokens and HTTP client
- **Design-to-code** — this renders pixels, not HTML/CSS/Flutter
- **Authoring / editing** — read + render only

## FAQ

### Why not just use the Figma Images API?

If you have API access, the Images API is usually simplest. This package is for when you need:

- Offline / air-gapped rendering
- Deterministic output in CI without network calls
- Custom viewport sizes or scale factors
- Rendering from `.fig` files without API access

### Does this work in the browser?

Yes. Import from `@grida/refig/browser`. The core renderer uses `@grida/canvas-wasm` which supports both Node (raster) and browser (WebGL) backends.

### What about fonts?

The WASM runtime ships with embedded fallback fonts. Custom font loading (Google Fonts, local directories) is planned but not yet available.

## Contributing

From the package root:

1. Install dependencies and build: `pnpm install && pnpm build`
2. Link the package so the `refig` CLI is available: `pnpm link --global`
3. Run the `refig` command from anywhere to test (e.g. `refig ./fixture.json --node "1:1" --out ./out.png`)

To unlink: `pnpm unlink --global`.

## License

See [`LICENSE`](./LICENSE).
