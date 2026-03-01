# `@grida/refig`

> **re**nder **fig**ma — headless Figma renderer (Node.js + browser) in the spirit of [`resvg`](https://github.com/linebender/resvg)

Render Figma documents to **PNG, JPEG, WebP, PDF, and SVG** in **Node.js (no browser required)** or directly in the **browser**.

Use a `.fig` export (offline) or a Figma REST API file JSON response (`GET /v1/files/:key`), pick a node ID, and get pixels.

Refig aims to render designs as faithfully as possible to the original. See [Known limitations](#known-limitations) for current exceptions.

## Features (checklist)

- [x] Render from **`.fig` files** (offline / no API calls)
- [x] Render from **Figma REST API JSON** (bring your own auth + HTTP client)
- [x] Output formats: **PNG, JPEG, WebP, PDF, SVG**
- [x] **CLI** (`refig`) and **library API** (`FigmaDocument`, `FigmaRenderer`)
- [x] **Node.js** + **browser** entrypoints (`@grida/refig`, `@grida/refig/browser`)
- [x] IMAGE fills supported via **embedded `.fig` images** or a **local `images/` directory** for REST JSON
- [x] **Bring-your-own-font** — supply custom font files for designs that use non-default typefaces
- [x] Batch export with **`--export-all`** (renders nodes with Figma export presets)
- [x] WASM + Skia-backed renderer via `@grida/canvas-wasm`

## Use cases

- Export assets in CI (deterministic, no network calls required)
- Generate thumbnails / previews from `.fig` or REST JSON
- Offline / air-gapped rendering from `.fig` exports
- In-browser previews with `@grida/refig/browser`

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
import { writeFileSync } from "node:fs";
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

### Render from REST JSON with custom images

When your document has IMAGE fills, pass image bytes keyed by the Figma image ref (hash):

```ts
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

const json = JSON.parse(readFileSync("figma-response.json", "utf-8"));
const imagesDir = "./downloaded-images";
const images: Record<string, Uint8Array> = {};
for (const file of readdirSync(imagesDir)) {
  const ref = path.basename(file).replace(/\.[^.]+$/, "");
  images[ref] = new Uint8Array(readFileSync(path.join(imagesDir, file)));
}

const renderer = new FigmaRenderer(new FigmaDocument(json), { images });
const { data } = await renderer.render("<node-id>", { format: "png" });
// ...
renderer.dispose();
```

### Render with custom fonts

Unlike images, fonts do not have a Figma API. Use **`listFontFamilies()`** to see which font families are used in your file (or a scoped node), then load those fonts and pass them to the renderer:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

const doc = FigmaDocument.fromFile("path/to/file.fig");

// 1. Discover font families used (omit rootNodeId for full document)
const fontFamilies = doc.listFontFamilies("<node-id>"); // e.g. ["Inter", "Caveat", "Roboto"]

// 2. Load your custom fonts (local FS, CDN, asset service, etc.)
// Skip Figma defaults (Inter, Noto Sans KR/JP/SC, etc.) — the renderer loads those.
const fonts: Record<string, Uint8Array> = {};
for (const family of fontFamilies) {
  if (
    family === "Inter" ||
    family.startsWith("Noto Sans") ||
    family === "Noto Color Emoji"
  )
    continue;
  fonts[family] = new Uint8Array(readFileSync(`./fonts/${family}.ttf`)); // adjust path to your font file structure
}

// 3. Render
const renderer = new FigmaRenderer(doc, { fonts });
const { data } = await renderer.render("<node-id>", { format: "png" });
writeFileSync("out.png", data);
renderer.dispose();
```

**CLI:** Use `--fonts <dir>` to pass a directory of TTF/OTF files (scanned recursively). Fonts are inferred from the name table; multiple files per family are grouped automatically. Use `--skip-default-fonts` to avoid loading Figma defaults (useful to verify custom font rendering):

```sh
refig ./figma-response.json --fonts ./my-fonts --node "1:23" --out out.png
refig ./doc.json --fonts ./my-fonts --node "1:23" --out out.png --skip-default-fonts
```

With a project directory, place fonts in `fonts/` next to `document.json` (and optionally `images/`); refig auto-discovers them:

```sh
refig ./my-figma-export --node "1:23" --format png
# Expects my-figma-export/document.json and, if present, my-figma-export/fonts/
```

Load **all** font files that match each family (variable or static) so the renderer can pick the right one for each text style, just like the original design. For multiple files per family (e.g. Regular, Bold, Italic), pass an array: `fonts: { "MyFamily": [regularBytes, boldBytes, italicBytes] }`.

If the design uses **locally-installed fonts** (fonts the designer had on their machine), loading those from your OS may require extra scripts or tooling to locate and extract the font files. We do not provide such tooling.

## Quick start (Browser)

```ts
import { FigmaDocument, FigmaRenderer } from "@grida/refig/browser";

// `file` is a File from <input type="file">, drag-and-drop, etc.
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

// Font families used in the document (for bring-your-own-font)
document.listFontFamilies(rootNodeId?: string): string[]
// — rootNodeId: optional; scope to that node's subtree, or omit for full document
// — returns unique family names; load all font files that match each family (VF or static)
```

### `FigmaRenderer`

```ts
const renderer = new FigmaRenderer(document: FigmaDocument, options?: {
  useEmbeddedFonts?: boolean;       // default: true
  loadFigmaDefaultFonts?: boolean;  // default: true — Inter, Noto Sans KR/JP/SC, etc.
  images?: Record<string, Uint8Array>;  // image ref → bytes; used for REST API IMAGE fills
  fonts?: Record<string, Uint8Array | Uint8Array[]>;  // font family → bytes (TTF/OTF); one or more files per family
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

Or run without installing:

```sh
# Instant usage (writes to OS temp dir; output path printed)
npx @grida/refig <input> --node <node-id> --format png
pnpm dlx @grida/refig <input> --export-all
```

### Usage

**`<input>`** can be:

- A **file**: path to a `.fig` file or a JSON file (Figma REST API response).
- A **directory**: path to a folder that contains:
  - **`document.json`** — the REST API response (required),
  - **`images/`** — directory of image assets (optional; used for REST API IMAGE fills),
  - **`fonts/`** — directory of font files TTF/OTF (optional; scanned recursively).

Using a directory avoids passing the document, images, and fonts separately.

```sh
# Single node (default)
# - Without --out: writes to OS temp dir (requires --format)
# - With --out: format inferred from file extension unless --format is provided
refig <input> --node <node-id> --format <fmt> [options]
refig <input> --node <node-id> --out <path> [--format <fmt>] [options]

# With images directory (REST JSON only; IMAGE fills rendered from local files)
refig <input> --images <dir> --node <node-id> --format <fmt> [options]
refig <input> --images <dir> --node <node-id> --out <path> [--format <fmt>] [options]

# Directory input: document.json + images/ under one folder
refig ./my-figma-export --node "1:23" --format png

# Export all nodes that have exportSettings (REST JSON or .fig)
refig <input> --export-all [--out <output-dir>]
```

### Examples

```sh
# Instant usage: omit --out to write to OS temp directory (output path printed)
refig ./design.fig --node "1:23" --format png
refig ./figma-response.json --node "1:23" --format svg

# Directory with document.json (and optionally images/): one path instead of response + --images
refig ./my-figma-export --node "1:23" --format png
# (my-figma-export/document.json, my-figma-export/images/)

# Explicit images directory (when not using a project directory)
refig ./figma-response.json --images ./downloaded-images --node "1:23" --format png

# Custom fonts (when design uses non-default typefaces)
refig ./figma-response.json --fonts ./my-fonts --node "1:23" --out out.png
refig ./doc.json --fonts ./fonts --node "1:23" --out out.png --skip-default-fonts

# Export all: render every node that has export settings (see below)
refig ./figma-response.json --export-all
refig ./design.fig --export-all

# Scale 2x, custom dimensions
refig ./design.fig --node "1:23" --format png --width 512 --height 512 --scale 2

# Deterministic output: provide --out (useful for CI or saving into a known path)
refig ./design.fig --node "1:23" --out ./out.png
refig ./figma-response.json --export-all --out ./exports

# No-install (run without installing)
npx @grida/refig ./design.fig --node "1:23" --format png
pnpm dlx @grida/refig ./design.fig --export-all
```

### Quick test via `figma_archive.py` (REST API → `document.json` + `images/`)

If you want an end-to-end test from a real Figma file using the REST API, you can generate a local “project directory” that refig can consume directly.

1. Archive a Figma file (stdlib-only Python script):

- Script: [`figma_archive.py` (gist)](https://gist.github.com/softmarshmallow/27ad65dfa5babc2c67b41740f1f05791)
- (For repo contributors, it’s also in this monorepo at `.tools/figma_archive.py`.)
- Save the script locally as `figma_archive.py`, then run:

```sh
# File key is the "<key>" part of `https://www.figma.com/file/<key>/...`
python3 figma_archive.py --x-figma-token "<token>" --filekey "<key>" --archive-dir ./my-figma-export
```

This writes:

- `./my-figma-export/document.json` (with `geometry=paths`)
- `./my-figma-export/images/<ref>.<ext>` (image fills downloaded from `/v1/files/:key/images`)

2. Render using the directory as `<input>`:

```sh
# Single node
refig ./my-figma-export --node "1:23" --format png

# Or export everything with Figma export presets
refig ./my-figma-export --export-all
```

### Export all (`--export-all`)

With **`--export-all`**, refig walks the document and renders every node that has [Figma export settings](https://www.figma.com/developers/api#exportsetting-type) — one file per (node, setting), using that setting’s format, suffix, and constraint. Both **REST API JSON** (e.g. `GET /v1/files/:key`) and **`.fig` files** are supported when the file includes export settings.

**When it’s useful:** You choose in Figma exactly what to export: select a node, click **Export +** in the right panel, add one or more presets (e.g. PNG @2x, SVG). Add exports on as many nodes as you want. Then run the CLI with `--export-all` and the path to your REST JSON; refig renders all of those with the same config, without long or repeated `--node` / `--format` / `--scale` options. Same idea for testing the renderer: add export presets on the nodes you care about in Figma, run `refig … --export-all --out ./out`, and compare outputs.

**REST API note:** The Figma REST API (`GET /v1/files/:key`) does not include `exportSettings` for SECTION nodes, even when those sections have export presets in Figma. FRAME, COMPONENT, INSTANCE, etc. correctly include them. As a result, `--export-all` on REST JSON will not discover SECTION exports; use a `.fig` file input if you need to export nodes that are sections. See [figma/rest-api-spec#87](https://github.com/figma/rest-api-spec/issues/87).

### Flags

| Flag                   | Required | Default                         | Description                                                                                                                                                                          |
| ---------------------- | -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<input>`              | yes      |                                 | Path to `.fig`, JSON file, or directory containing `document.json` (and optionally `images/`, `fonts/`)                                                                              |
| `--images <dir>`       | no       |                                 | Directory of image assets for REST document (ignored if `<input>` is a dir with `images/`)                                                                                           |
| `--fonts <dir>`        | no       |                                 | Directory of font files (TTF/OTF) for custom fonts (ignored if `<input>` is a dir with `fonts/`)                                                                                     |
| `--node <id>`          | yes\*    |                                 | Figma node ID to render (\*omit when using `--export-all`)                                                                                                                           |
| `--out <path>`         | no       | OS temp dir when omitted        | Output file path (single node) or output directory (`--export-all`). When omitted, writes to the OS temp directory (valid with `--export-all` or with both `--format` and `--node`). |
| `--export-all`         | no       |                                 | Export every node with exportSettings (REST JSON or .fig); `--out` is a directory                                                                                                    |
| `--format <fmt>`       | no       | inferred from `--out` extension | `png`, `jpeg`, `webp`, `pdf`, `svg` (single-node only; required when `--out` is omitted)                                                                                             |
| `--width <px>`         | no       | `1024`                          | Viewport width (single-node only)                                                                                                                                                    |
| `--height <px>`        | no       | `1024`                          | Viewport height (single-node only)                                                                                                                                                   |
| `--scale <n>`          | no       | `1`                             | Raster scale factor (single-node only)                                                                                                                                               |
| `--skip-default-fonts` | no       |                                 | Do not load Figma default fonts (Inter, Noto Sans, etc.); use only custom fonts from `--fonts` or `fonts/`                                                                           |

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

## Images

**`.fig` input** — Image fills used in the design are stored inside the `.fig` file. No extra step is required; refig uses them when rendering.

**REST API input** — The file JSON does not contain image bytes; it references image fills by hash. To render with correct bitmaps you must supply the image assets:

1. **Fetch image fills** — Call `GET /v1/files/:key/images` (Figma REST API). This returns the list of **image fills** used in the file (i.e. which bitmap images are used as fills), not “export node as image.” The response includes a mapping of image hash → URL (signed) for each fill.

2. **Download and pass an images directory (recommended)** — Download each image from the returned URLs and save them under a directory using the `<hash>.<ext>` naming (e.g. `a1b2c3d4....png`). Pass that directory to refig as the **images directory**. We recommend this because the URLs from the API are **signed and expire**; downloading once and reusing the files avoids expiry and keeps rendering repeatable (e.g. in CI or offline).

**API** — `FigmaRenderer` accepts an optional **`images`** option: `Record<string, Uint8Array>` (image ref → bytes). Supply image assets when using REST document input; IMAGE fills will render using these bytes. Refs must match the Figma image fill hashes in the document.

**CLI** — You can pass images in two ways:

- **`--images <dir>`** — Explicit images directory. Files are keyed by filename without extension (e.g. `a1b2c3d4.png` → ref `a1b2c3d4`). Use when the document is a separate file:  
  `refig ./figma-response.json --images ./downloaded-images --node "1:23" --format png`
- **Directory input** — Pass a single directory that contains **`document.json`** (REST response) and optionally **`images/`** and **`fonts/`**. No need to pass `--images` or `--fonts` separately:  
  `refig ./my-figma-export --node "1:23" --format png`  
  (expects `my-figma-export/document.json` and, if present, `my-figma-export/images/` and `my-figma-export/fonts/`.)

For **`.fig`** input, images are embedded in the file; no extra images directory is needed. For **REST** input, use `--images` or a project directory with `images/` to render IMAGE fills correctly.

## Known limitations

- **Rich text** — Text with mixed styles (e.g. bold and italic in the same paragraph) is not yet supported.
- **Image transformation** — Complex image transforms from Figma designs are not yet properly aligned. Known issue; will fix.
- **Emoji** — Rendered with Noto Color Emoji instead of Figma's platform emoji (Apple Color Emoji / Segoe UI Emoji). Output differs by design.

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
- High-throughput or random access where the API is too slow or rate-limited (e.g. low Figma tier)
- Avoiding Figma access token lifecycle (refresh, storage, rotation)

### Does this work in the browser?

Yes. Import from `@grida/refig/browser`. The core renderer uses `@grida/canvas-wasm` which supports both Node (raster) and browser (WebGL) backends.

### What about fonts?

The WASM runtime ships with embedded fallback fonts (Geist / Geist Mono). **`loadFigmaDefaultFonts`** is enabled by default: the renderer loads the Figma default font set (Inter, Noto Sans KR/JP/SC, and optionally Noto Sans TC/HK and Noto Color Emoji) from CDN and registers them as fallbacks before the first render, so mixed-script and CJK text avoid tofu. Set **`loadFigmaDefaultFonts: false`** to disable (e.g. to avoid network or use only embedded fonts).

**Custom fonts** (e.g. Caveat, Roboto, brand typefaces) use the bring-your-own-font flow: call **`document.listFontFamilies(rootNodeId?)`** to see which families are used, load those fonts yourself, then pass **`fonts: Record<string, Uint8Array>`** to `FigmaRenderer`. See [Render with custom fonts](#render-with-custom-fonts).

## Contributing

From the package root:

1. Install dependencies and build: `pnpm install && pnpm build`
2. Link the package so the `refig` CLI is available: `pnpm link --global`
3. Run the `refig` command from anywhere to test (e.g. `refig ./fixture.json --node "1:1" --format png`)

To unlink: `pnpm unlink --global`.

## License

See [`LICENSE`](./LICENSE).
