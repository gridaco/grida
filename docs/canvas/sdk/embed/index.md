---
title: Embed SDK
format: md
---

# Embed SDK

Embed the Grida Canvas viewer in any web page via an iframe and control it programmatically with the host-side SDK.

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

  embed.on("ready", ({ scenes }) => {
    console.log("Loaded", scenes.length, "scenes");
  });

  embed.on("selection-change", ({ selection }) => {
    console.log("Selected nodes:", selection);
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

const embed = new GridaEmbed(iframe: HTMLIFrameElement);
```

Commands sent before the viewer is ready are queued and flushed automatically.

### Commands

#### `load(data, format)`

Load a file into the viewer via postMessage. Bypasses CORS entirely -- the host reads the file and sends the raw bytes.

```ts
const res = await fetch("http://localhost:3000/design.fig");
const buf = await res.arrayBuffer();

embed.load(buf, "fig");
```

| Parameter | Type                                    | Description        |
| --------- | --------------------------------------- | ------------------ |
| `data`    | `ArrayBuffer \| Uint8Array \| Blob`     | Raw file contents. |
| `format`  | `"fig" \| "json" \| "json.gz" \| "zip"` | File format.       |

#### `select(nodeIds, mode?)`

Select nodes in the viewer.

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

Switch the active scene (page).

```ts
embed.on("ready", ({ scenes }) => {
  embed.loadScene(scenes[1].id);
});
```

#### `fit(options?)`

Fit the camera to show all content (or a specific selector).

```ts
embed.fit();
embed.fit({ animate: true });
```

| Option     | Type      | Default | Description                                                        |
| ---------- | --------- | ------- | ------------------------------------------------------------------ |
| `selector` | `string`  | `"*"`   | What to fit. `"*"` = all nodes, `"selection"` = current selection. |
| `animate`  | `boolean` | `false` | Animate the camera transition.                                     |

### Events

#### `ready`

Fired once after the viewer has loaded and the document is parsed. Carries the scene list.

```ts
embed.on("ready", ({ scenes }) => {
  // scenes: Array<{ id: string; name: string }>
});
```

#### `selection-change`

Fired when the selected nodes change.

```ts
embed.on("selection-change", ({ selection }) => {
  // selection: string[] (node IDs)
});
```

#### `scene-change`

Fired when the active scene changes.

```ts
embed.on("scene-change", ({ sceneId }) => {
  // sceneId: string
});
```

### `dispose()`

Removes the message listener and clears all state. Call when the embed is no longer needed.

```ts
embed.dispose();
```

## Local development

When developing locally, the file you want to preview is often on `localhost` which the hosted embed cannot fetch due to CORS. Use `load()` to push the file bytes directly:

```html
<iframe id="grida" src="https://grida.co/embed/v1/refig"></iframe>

<script type="module">
  import { GridaEmbed } from "@grida/embed";

  const embed = new GridaEmbed(document.getElementById("grida"));

  // Read the file on the host side (same origin, no CORS issue)
  const res = await fetch("/design.fig");
  const buf = await res.arrayBuffer();

  // Push bytes to the embed -- no network request from the iframe
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

The SDK communicates via `window.postMessage`. All messages are plain objects with a `type` field prefixed by `grida:`.

### Host to iframe

| Message type       | Payload                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `grida:select`     | `{ nodeIds: string[], mode?: "reset" \| "add" \| "toggle" }`           |
| `grida:load-scene` | `{ sceneId: string }`                                                  |
| `grida:fit`        | `{ selector?: string, animate?: boolean }`                             |
| `grida:load`       | `{ data: ArrayBuffer, format: "fig" \| "json" \| "json.gz" \| "zip" }` |

### Iframe to host

| Message type             | Payload                                           |
| ------------------------ | ------------------------------------------------- |
| `grida:ready`            | `{ scenes: Array<{ id: string, name: string }> }` |
| `grida:selection-change` | `{ selection: string[] }`                         |
| `grida:scene-change`     | `{ sceneId: string }`                             |

You can use the protocol directly without the SDK if preferred. The SDK is a thin convenience wrapper over these messages.
