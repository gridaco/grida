WASM bindings for Grida Canvas.

## Getting Started

**Install**

```bash
pnpm install @grida/canvas-wasm
```

```ts
import init from "@grida/canvas-wasm";

const factory = await init({
  // locate the wasm binary file
  locateFile: (path) =>
    `https://unpkg.com/@grida/canvas-wasm@<VERSION>/bin/${path}`,
});

// your canvas element
const canvas = document.querySelector("#canvas");
const context = canvas.getContext("webgl2", {
  antialias: true,
  depth: true,
  stencil: true,
  alpha: true,
});

const scene = factory.createSurface(context, 100, 100);

// ready to draw
scene.createRectangleNode();
scene.redraw();
```
