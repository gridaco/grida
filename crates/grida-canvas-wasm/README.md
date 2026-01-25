WASM bindings for Grida Canvas.

## Getting Started

**Install**

```bash
pnpm install @grida/canvas-wasm
```

### Browser (WebGL)

```ts
import init from "@grida/canvas-wasm";

const factory = await init({
  // locate the wasm binary file (location may vary by version)
  // e.g. this will resolve to https://unpkg.com/@grida/canvas-wasm@0.0.2/dist/grida_canvas_wasm.wasm
  locateFile: (path) =>
    `https://unpkg.com/@grida/canvas-wasm@<VERSION>/${path}`,
});

// your canvas element
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const scene = factory.createWebGLCanvasSurface(canvas);

// ready to draw
scene.loadDummyScene();
```

### Node (raster export)

```ts
import { createCanvas } from "@grida/canvas-wasm";
import { readFileSync, writeFileSync } from "node:fs";

const canvas = await createCanvas({
  backend: "raster",
  width: 256,
  height: 256,
});

const doc = readFileSync("example/rectangle.grida1", "utf8");
canvas.loadScene(doc);

const { data } = canvas.exportNodeAs("rectangle", {
  format: "PNG",
  constraints: { type: "none", value: 1 },
});

writeFileSync("out.png", Buffer.from(data));
```

## Serving locally for development

For local development, this package has `serve` ready.

```bash
pnpm install
pnpm serve
# will be served at http://localhost:4020/
# e.g. http://localhost:4020/dist/index.js
```

For instance, you can use the locally served wasm like below.

```ts
await init({
  locateFile: (path) => {
    if (process.env.NODE_ENV === "development") {
      return `http://localhost:4020/dist/${path}`;
    }
    `https://unpkg.com/@grida/canvas-wasm@latest/${path}`,
  },
});
```
