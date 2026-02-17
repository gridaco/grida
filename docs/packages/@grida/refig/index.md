---
title: refig
---

### `@grida/refig` (refig)

**refig** is a headless Figma renderer: render Figma documents to **PNG, JPEG, WebP, PDF, or SVG** in **Node.js (no browser required)** or directly in the **browser**.

It’s built for **deterministic exports** (CI-friendly), **offline rendering** (from `.fig`), and **high-throughput previews** (thumbnails, snapshots, asset pipelines).

- **npm package**: [`@grida/refig`](https://www.npmjs.com/package/@grida/refig) (technical reference, API, and CLI usage)

---

### Demo

<div style="padding:64.67% 0 0 0;position:relative;"><iframe src="https://player.vimeo.com/video/1165652748?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479&amp;autoplay=1&amp;muted=1&amp;loop=1" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="refig (headless figma renderer) demo"></iframe></div><script src="https://player.vimeo.com/api/player.js"></script>

---

### What it does (and doesn’t)

- **Renders pixels (and vector outputs)** from a Figma document + a target node id
- **Does not** fetch from the Figma API for you (bring your own auth + HTTP client)
- **Does not** do design-to-code (HTML/CSS/Flutter). It exports images/doc bytes.

---

### Inputs you can render

- **`.fig` files** (offline): great for air-gapped builds and reproducible rendering
- **Figma REST API file JSON** (`GET /v1/files/:key`): great when you already have an API ingestion layer

If your design uses **IMAGE fills**:

- With **`.fig`** input, image bytes are embedded in the file.
- With **REST JSON**, the document references image hashes; you provide the bytes (commonly by downloading image fills once and reusing them).

---

### Two ways to use it

- **Library**: `FigmaDocument` + `FigmaRenderer` (Node and browser entrypoints)
- **CLI**: `refig` for scripting and batch exports

---

### Quick start (Node.js)

```ts
import { writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

const doc = FigmaDocument.fromFile("./design.fig"); // .fig or REST JSON .json
const renderer = new FigmaRenderer(doc);

const { data } = await renderer.render("1:23", { format: "png", scale: 2 });
writeFileSync("out.png", data);

renderer.dispose();
```

---

### Quick start (CLI)

```sh
# Render a single node
npx @grida/refig ./design.fig --node "1:23" --out ./out.png

# Export everything that has Figma export presets configured
npx @grida/refig ./design.fig --export-all --out ./exports
```

---

### Why teams use refig

- **Deterministic exports** in CI (avoid flaky UI automation)
- **Offline rendering** from `.fig` archives
- **Faster previews** than API-driven “export images” workflows in high-volume pipelines
- **One renderer** for Node and browser (use the browser entrypoint for in-app previews)

---

### Learn more

- **Package & reference docs on npm**: [`@grida/refig`](https://www.npmjs.com/package/@grida/refig)
