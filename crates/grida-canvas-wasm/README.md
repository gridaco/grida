WASM bindings for Grida Canvas.

## Getting Started

**Install**

```bash
pnpm install @grida/canvas-wasm
```

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
