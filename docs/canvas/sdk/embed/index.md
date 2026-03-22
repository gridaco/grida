---
title: Embed SDK
format: md
---

# Embed SDK

Embed the Grida Canvas viewer in any web page via an iframe and control it programmatically.

## Quick start

```html
<iframe
  id="grida"
  src="https://grida.co/embed/v1/refig?file=https://example.com/design.fig"
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
https://grida.co/embed/v1/refig
```

### Query parameters

| Parameter | Required | Description                                                                                                                        |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `file`    | No       | URL to a `.fig`, `.json`, `.json.gz`, or `.zip` file. If omitted, the viewer starts empty and expects a `load()` call via the SDK. |

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
const buf = await fetch("/design.fig").then((r) => r.arrayBuffer());
embed.load(buf, "fig");
```

| Parameter | Type                                    | Description        |
| --------- | --------------------------------------- | ------------------ |
| `data`    | `ArrayBuffer \| Uint8Array \| Blob`     | Raw file contents. |
| `format`  | `"fig" \| "json" \| "json.gz" \| "zip"` | File format.       |

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
  v
grida:load command       (host loads a new file)
  |
  v
grida:document-load      (new document, fresh scene list)
  ...
```

During a document load/reset, `selection-change` and `scene-change` events are **suppressed**. They only fire for changes that happen after the document is fully loaded. This prevents stale intermediate state from leaking to the host.

Images are loaded lazily -- the renderer reports which image refs it needs as it encounters them during rendering. The host resolves and provides bytes on demand. Only visible images are requested.

## Local development

```html
<iframe id="grida" src="https://grida.co/embed/v1/refig"></iframe>

<script type="module">
  import { GridaEmbed } from "@grida/embed";

  const embed = new GridaEmbed(document.getElementById("grida"));

  const buf = await fetch("/design.fig").then((r) => r.arrayBuffer());
  embed.load(buf, "fig");
</script>
```

## Supported file formats

| Format          | Extension  | Description                                  |
| --------------- | ---------- | -------------------------------------------- |
| Figma binary    | `.fig`     | Exported `.fig` file from Figma              |
| Figma REST JSON | `.json`    | Response from Figma `GET /v1/files/:key` API |
| Compressed JSON | `.json.gz` | Gzip-compressed Figma REST JSON              |
| Grida archive   | `.zip`     | Grida `.grida` archive (ZIP)                 |

## Protocol reference

The SDK communicates via `window.postMessage`. All messages have a `type` field prefixed by `grida:`. You can use the protocol directly without the SDK.

### Host to iframe (commands)

| Message type           | Payload                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `grida:load`           | `{ data: ArrayBuffer, format: "fig" \| "json" \| "json.gz" \| "zip" }` |
| `grida:select`         | `{ nodeIds: string[], mode?: "reset" \| "add" \| "toggle" }`           |
| `grida:load-scene`     | `{ sceneId: string }`                                                  |
| `grida:fit`            | `{ selector?: string, animate?: boolean }`                             |
| `grida:ping`           | (none)                                                                 |
| `grida:images-resolve` | `{ images: Record<string, ArrayBuffer> }`                              |

### Iframe to host (events)

| Message type             | Payload                                                                                                 | When                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `grida:ready`            | (none)                                                                                                  | Once, canvas mounted                                |
| `grida:document-load`    | `{ scenes: Array<{ id: string, name: string }> }`                                                       | Each document load, after state is settled          |
| `grida:selection-change` | `{ selection: string[] }`                                                                               | Selection changes (suppressed during document load) |
| `grida:scene-change`     | `{ sceneId: string }`                                                                                   | Scene changes (suppressed during document load)     |
| `grida:images-needed`    | `{ refs: string[] }`                                                                                    | Renderer needs image bytes (lazy, deduplicated)     |
| `grida:pong`             | `{ ready: boolean, scenes: Array<{ id: string, name: string }>, sceneId: string, selection: string[] }` | Reply to `grida:ping`                               |
