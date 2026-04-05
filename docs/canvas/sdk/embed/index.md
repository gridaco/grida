---
title: Embed SDK
format: md
---

# Embed SDK

Embed the Grida Canvas viewer in any web page via an iframe and control it programmatically.

## Endpoints

Grida provides two embed endpoints, plus a debug harness:

| Endpoint          | Purpose                                     | Node ID contract         |
| ----------------- | ------------------------------------------- | ------------------------ |
| `/embed/v1/`      | General-purpose viewer — any supported file | Grida-internal IDs       |
| `/embed/v1/figma` | Figma-specific viewer                       | Original Figma IDs       |
| `/embed/v1/debug` | Debug harness (mode picker + message log)   | Depends on selected mode |

### `/embed/v1/` — General-purpose embed

The recommended default. Accepts any file that Grida supports: `.grida`, `.grida1`, `.fig`, `.json`, `.json.gz`, `.zip`.

Node IDs in events (`selection-change`, `scene-change`, etc.) use Grida-internal IDs. Use this when embedding a design for viewing and you don't need Figma-specific ID mapping.

```html
<iframe
  id="grida"
  src="https://grida.co/embed/v1/?file=https://example.com/design.grida"
  width="800"
  height="600"
  style="border: none"
></iframe>
```

### `/embed/v1/figma` — Figma-specific embed

Accepts the same file formats as the general embed, but emits Figma-specific events: node IDs in `selection-change`, `scene-change`, and `pong` events are transformed back to original Figma node IDs (e.g. `"42:17"`).

Use this when the host needs to work with Figma's ID contract — for example, to correlate selected nodes with Figma API data or custom ID mappings.

```html
<iframe
  id="grida"
  src="https://grida.co/embed/v1/figma?file=https://example.com/design.fig"
  width="800"
  height="600"
  style="border: none"
></iframe>
```

### `/embed/v1/debug` — Debug harness

Interactive debug page for testing either endpoint. Provides:

- **Mode picker** — switch between general and Figma modes
- **Load controls** — load files via `?file=` URL or `grida:load` postMessage
- **Command panel** — send ping, fit, select, scene switch
- **Message log** — real-time display of all postMessage traffic

## Quick start

```html
<iframe
  id="grida"
  src="https://grida.co/embed/v1/?file=https://example.com/design.grida"
  width="800"
  height="600"
  style="border: none"
></iframe>

<script type="module">
  import { GridaEmbed } from "@grida/embed";

  const embed = new GridaEmbed(document.getElementById("grida"));

  embed.on("ready", () => {
    console.log("Canvas mounted");
  });

  embed.on("document-load", ({ scenes }) => {
    console.log("Loaded", scenes.length, "scenes");
  });

  embed.on("selection-change", ({ selection }) => {
    console.log("Selected:", selection);
  });
</script>
```

## Iframe URL

```
https://grida.co/embed/v1/
https://grida.co/embed/v1/figma
```

### Query parameters

| Parameter | Required | Description                                                                                                                                             |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`    | No       | URL to a `.grida`, `.grida1`, `.fig`, `.json`, `.json.gz`, or `.zip` file. If omitted, the viewer starts empty and expects a `load()` call via the SDK. |

The `file` URL must be CORS-accessible from the embed origin. For files that cannot satisfy CORS (e.g. localhost during development), use `load()` instead.

## Host SDK

### `GridaEmbed`

```ts
import { GridaEmbed } from "@grida/embed";

const embed = new GridaEmbed(iframe);
```

Commands sent before `ready` are queued and flushed automatically.

### Commands

#### `load(data, format)`

Load a file into the viewer. Can be called multiple times to replace the document. Bypasses CORS -- the host reads the file and sends the raw bytes via postMessage.

```ts
const buf = await fetch("/design.grida").then((r) => r.arrayBuffer());
embed.load(buf, "grida");
```

| Parameter | Type                                                           | Description        |
| --------- | -------------------------------------------------------------- | ------------------ |
| `data`    | `ArrayBuffer \| Uint8Array \| Blob`                            | Raw file contents. |
| `format`  | `"grida" \| "grida1" \| "fig" \| "json" \| "json.gz" \| "zip"` | File format.       |

#### `select(nodeIds, mode?)`

```ts
embed.select(["1:23", "1:24"]); // replace selection
embed.select(["1:25"], "add"); // add to selection
embed.select([]); // clear selection
```

| Parameter | Type                           | Default   | Description                                       |
| --------- | ------------------------------ | --------- | ------------------------------------------------- |
| `nodeIds` | `string[]`                     |           | Node IDs to select. Empty array clears selection. |
| `mode`    | `"reset" \| "add" \| "toggle"` | `"reset"` | How to combine with existing selection.           |

> **Note:** When using `/embed/v1/figma`, pass Figma node IDs (e.g. `"42:17"`). When using `/embed/v1/`, pass Grida-internal node IDs.

#### `loadScene(sceneId)`

Switch the active scene (page). Use scene IDs from the `document-load` event.

```ts
embed.on("document-load", ({ scenes }) => {
  embed.loadScene(scenes[0].id);
});
```

#### `fit(options?)`

Fit the camera to content.

```ts
embed.fit();
embed.fit({ selector: "selection", animate: true });
```

| Option     | Type      | Default | Description                                                        |
| ---------- | --------- | ------- | ------------------------------------------------------------------ |
| `selector` | `string`  | `"*"`   | What to fit. `"*"` = all nodes, `"selection"` = current selection. |
| `animate`  | `boolean` | `false` | Animate the camera transition.                                     |

#### `resolveImages(images)`

Resolve image refs requested via the `images-needed` event by providing their bytes.

```ts
embed.on("images-needed", async ({ refs }) => {
  const images = {};
  for (const rid of refs) {
    const res = await fetch(myImageResolver(rid));
    images[rid] = await res.arrayBuffer();
  }
  embed.resolveImages(images);
});
```

| Parameter | Type                          | Description                    |
| --------- | ----------------------------- | ------------------------------ |
| `images`  | `Record<string, ArrayBuffer>` | Map of RID to raw image bytes. |

#### `ping()`

Request a state snapshot from the iframe. It replies with a `pong` event containing the full current state. Useful to verify connectivity or re-sync if the host missed events. Bypasses the ready queue -- can be called at any time.

```ts
embed.ping();
embed.on("pong", ({ ready, scenes, sceneId, selection }) => {
  console.log("State:", { ready, scenes, sceneId, selection });
});
```

#### `exportNode(nodeId, format, requestId?)`

Export a single node as an image, PDF, or SVG. Returns a Promise that resolves with the raw exported bytes, or `null` if the node was not found or the export failed.

```ts
const pngBytes = await embed.exportNode("1:23", {
  format: "PNG",
  constraints: { type: "scale", value: 2 },
});

if (pngBytes) {
  const blob = new Blob([pngBytes], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  // use url...
}
```

| Parameter   | Type             | Description                                                              |
| ----------- | ---------------- | ------------------------------------------------------------------------ |
| `nodeId`    | `string`         | The node to export.                                                      |
| `format`    | `EmbedExportAs`  | Export format descriptor (see below).                                    |
| `requestId` | `string` (opt.)  | Caller-chosen ID for correlating the response. Auto-generated if omitted.|

**`EmbedExportAs` format variants:**

| Format | Required fields                           | Optional            |
| ------ | ----------------------------------------- | ------------------- |
| PNG    | `{ format: "PNG", constraints }`          |                     |
| JPEG   | `{ format: "JPEG", constraints }`         | `quality` (0--100)  |
| WEBP   | `{ format: "WEBP", constraints }`         | `quality` (0--100)  |
| BMP    | `{ format: "BMP", constraints }`          |                     |
| PDF    | `{ format: "PDF" }`                       |                     |
| SVG    | `{ format: "SVG" }`                       |                     |

**`constraints` options:**

| Type                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `{ type: "none" }`              | Export at native resolution.          |
| `{ type: "scale", value: 2 }`  | Scale by the given factor (e.g. 2x). |
| `{ type: "scale-to-fit-width", value: 1024 }`  | Scale to fit the given width (px).  |
| `{ type: "scale-to-fit-height", value: 768 }`  | Scale to fit the given height (px). |

#### `getNodeIdPath(nodeId, requestId?)`

Get the structural ancestry path from the scene root to a node. Returns a Promise that resolves with `[root, ..., parent, nodeId]`, or `null` if the node does not exist.

```ts
const path = await embed.getNodeIdPath("1:23");
// e.g. ["0:1", "1:2", "1:23"]
```

| Parameter   | Type             | Description                                                              |
| ----------- | ---------------- | ------------------------------------------------------------------------ |
| `nodeId`    | `string`         | The target node.                                                         |
| `requestId` | `string` (opt.)  | Caller-chosen ID for correlating the response. Auto-generated if omitted.|

### Events

All events follow `.on(name, callback)` and return an unsubscribe function.

#### `ready`

Fired once when the WASM canvas is mounted. The viewer now accepts commands.

```ts
const off = embed.on("ready", () => {});
```

#### `document-load`

Fired each time a document finishes loading. This is the only place you receive the scene list. Guaranteed to fire **after** all internal state (scene, selection) is settled -- no stale intermediate events leak before this.

```ts
embed.on("document-load", ({ scenes }) => {
  // scenes: Array<{ id: string; name: string }>
});
```

#### `selection-change`

Fired when the selection changes (user interaction or programmatic).

```ts
embed.on("selection-change", ({ selection }) => {
  // selection: string[] (node IDs)
  // /embed/v1/figma: Figma IDs like "42:17"
  // /embed/v1/:       Grida-internal IDs
});
```

#### `scene-change`

Fired when the active scene changes (user interaction or programmatic). Not fired during document load -- use `document-load` for the initial scene.

```ts
embed.on("scene-change", ({ sceneId }) => {
  // sceneId: string
});
```

#### `images-needed`

Emitted when the renderer encounters image paints whose bytes haven't been loaded. Contains the RIDs of the missing images. The host should resolve these (e.g. via Figma API, CDN, local files) and call `resolveImages()`.

Only emits refs not previously requested — no duplicates across frames.

```ts
embed.on("images-needed", async ({ refs }) => {
  // refs: string[] (RIDs like "res://images/abc123")
  // resolve and provide bytes
});
```

#### `pong`

Reply to `ping()`. Contains a full state snapshot.

```ts
embed.on("pong", ({ ready, scenes, sceneId, selection }) => {
  // ready: boolean
  // scenes: Array<{ id: string; name: string }>
  // sceneId: string | undefined
  // selection: string[]
});
```

#### `export-result`

Reply to an `exportNode()` call (or raw `grida:export` command). Contains the exported bytes and the request correlation ID.

```ts
embed.on("export-result", ({ requestId, data, format }) => {
  // requestId: string (matches the request)
  // data: ArrayBuffer | null
  // format: string (e.g. "PNG", "SVG")
});
```

#### `node-id-path-result`

Reply to a `getNodeIdPath()` call (or raw `grida:get-node-id-path` command). Contains the ancestry path and the request correlation ID.

```ts
embed.on("node-id-path-result", ({ requestId, path }) => {
  // requestId: string (matches the request)
  // path: string[] | null (e.g. ["0:1", "1:2", "1:23"])
});
```

### `dispose()`

Removes all listeners. Call when the embed is no longer needed.

```ts
embed.dispose();
```

## Event lifecycle

```
iframe loads
  |
  v
grida:ready              (once, canvas mounted)
  |
  v
grida:document-load      (document parsed, scenes available)
  |
  +-- render needs images --> grida:images-needed
  +-- host provides -------> grida:images-resolve --> re-render
  |
  +-- user interacts ------> grida:selection-change
  +-- user interacts ------> grida:scene-change
  |
  +-- host requests -------> grida:export -----------> grida:export-result
  +-- host requests -------> grida:get-node-id-path -> grida:node-id-path-result
  |
  v
grida:load command       (host loads a new file)
  |
  v
grida:document-load      (new document, fresh scene list)
  ...
```

During a document load/reset, `selection-change` and `scene-change` events are **suppressed**. They only fire for changes that happen after the document is fully loaded. This prevents stale intermediate state from leaking to the host.

Images are loaded lazily -- the renderer reports which image refs it needs as it encounters them during rendering. The host resolves and provides bytes on demand. Only visible images are requested.

## Need headless rendering instead?

If you need to render Figma designs to **PNG, JPEG, WebP, PDF, or SVG** in Node.js or CI (no browser required), check out **`@grida/refig`** — a headless Figma renderer with CLI and library API. Great for deterministic exports, offline rendering from `.fig`, and high-throughput asset pipelines.

- **refig docs**: [https://grida.co/docs/packages/@grida/refig](https://grida.co/docs/packages/@grida/refig)
- **npm**: [`@grida/refig`](https://www.npmjs.com/package/@grida/refig)

## Choosing an endpoint

| Use case                                               | Endpoint          | Why                                           |
| ------------------------------------------------------ | ----------------- | --------------------------------------------- |
| Embed any Grida design                                 | `/embed/v1/`      | Format-agnostic, Grida-native IDs             |
| Embed a Figma file with Figma-compatible events        | `/embed/v1/figma` | Events use original Figma node IDs            |
| Customer-facing Figma render with programmatic control | `/embed/v1/figma` | Figma ID contract for selection/scene mapping |
| Debug / test any embed                                 | `/embed/v1/debug` | Mode picker, message inspector                |

## Local development

```html
<iframe id="grida" src="https://grida.co/embed/v1/"></iframe>

<script type="module">
  import { GridaEmbed } from "@grida/embed";

  const embed = new GridaEmbed(document.getElementById("grida"));

  // Load a .grida file
  const buf = await fetch("/design.grida").then((r) => r.arrayBuffer());
  embed.load(buf, "grida");

  // Or load a .fig file (works on both endpoints)
  const figBuf = await fetch("/design.fig").then((r) => r.arrayBuffer());
  embed.load(figBuf, "fig");
</script>
```

## Supported file formats

| Format          | Extension  | Description                                  | Supported by                    |
| --------------- | ---------- | -------------------------------------------- | ------------------------------- |
| Grida archive   | `.grida`   | Native Grida archive (ZIP with FlatBuffers)  | `/embed/v1/`, `/embed/v1/figma` |
| Grida snapshot  | `.grida1`  | Grida JSON snapshot                          | `/embed/v1/`, `/embed/v1/figma` |
| Figma binary    | `.fig`     | Exported `.fig` file from Figma              | `/embed/v1/`, `/embed/v1/figma` |
| Figma REST JSON | `.json`    | Response from Figma `GET /v1/files/:key` API | `/embed/v1/`, `/embed/v1/figma` |
| Compressed JSON | `.json.gz` | Gzip-compressed Figma REST JSON              | `/embed/v1/`, `/embed/v1/figma` |
| Figma archive   | `.zip`     | Figma REST archive (ZIP)                     | `/embed/v1/`, `/embed/v1/figma` |

## Protocol reference

The SDK communicates via `window.postMessage`. All messages have a `type` field prefixed by `grida:`. You can use the protocol directly without the SDK.

### Host to iframe (commands)

| Message type               | Payload                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `grida:load`               | `{ data: ArrayBuffer, format: "grida" \| "grida1" \| "fig" \| "json" \| "json.gz" \| "zip" }` |
| `grida:select`             | `{ nodeIds: string[], mode?: "reset" \| "add" \| "toggle" }`                                  |
| `grida:load-scene`         | `{ sceneId: string }`                                                                         |
| `grida:fit`                | `{ selector?: string, animate?: boolean }`                                                    |
| `grida:ping`               | (none)                                                                                        |
| `grida:images-resolve`     | `{ images: Record<string, ArrayBuffer> }`                                                     |
| `grida:export`             | `{ requestId: string, nodeId: string, format: EmbedExportAs }`                                |
| `grida:get-node-id-path`   | `{ requestId: string, nodeId: string }`                                                       |

### Iframe to host (events)

| Message type                  | Payload                                                                                                 | When                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `grida:ready`                 | (none)                                                                                                  | Once, canvas mounted                                |
| `grida:document-load`         | `{ scenes: Array<{ id: string, name: string }> }`                                                       | Each document load, after state is settled          |
| `grida:selection-change`      | `{ selection: string[] }`                                                                               | Selection changes (suppressed during document load) |
| `grida:scene-change`          | `{ sceneId: string }`                                                                                   | Scene changes (suppressed during document load)     |
| `grida:images-needed`         | `{ refs: string[] }`                                                                                    | Renderer needs image bytes (lazy, deduplicated)     |
| `grida:pong`                  | `{ ready: boolean, scenes: Array<{ id: string, name: string }>, sceneId: string, selection: string[] }` | Reply to `grida:ping`                               |
| `grida:export-result`         | `{ requestId: string, data: ArrayBuffer \| null, format: string }`                                      | Reply to `grida:export`                             |
| `grida:node-id-path-result`   | `{ requestId: string, path: string[] \| null }`                                                         | Reply to `grida:get-node-id-path`                   |
