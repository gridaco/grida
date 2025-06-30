"use client";
import * as React from "react";
import init, { type Grida2D } from "@grida/canvas-wasm";

const __test_document = `{"version":"0.0.1-beta.1+20250303","document":{"bitmaps":{},"images":{},"properties":{},"nodes":{"25575e75-a544-4fa3-b199-15d1906588b2":{"id":"25575e75-a544-4fa3-b199-15d1906588b2","name":"rectangle","locked":false,"active":true,"position":"absolute","top":0,"left":0,"opacity":1,"zIndex":0,"rotation":0,"fill":{"type":"solid","color":{"r":217,"g":217,"b":217,"a":1}},"width":100,"height":100,"style":{},"type":"rectangle","cornerRadius":0,"effects":[],"strokeWidth":0,"strokeCap":"butt"}},"scenes":{"main":{"type":"scene","guides":[],"edges":[],"constraints":{"children":"multiple"},"children":["25575e75-a544-4fa3-b199-15d1906588b2"],"id":"main","name":"main","backgroundColor":{"r":245,"g":245,"b":245,"a":1}}}}}`;

export default function CanvasWasmExperimentalPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<Grida2D | null>(null);

  React.useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      const canvasel = canvasRef.current;
      init({
        locateFile: (path) =>
          `https://unpkg.com/@grida/canvas-wasm@latest/dist/${path}`,
      }).then((factory) => {
        console.log("grida wasm initialized");
        const grida = factory.createWebGLCanvasSurface(canvasel);

        grida.devtools_rendering_set_show_tiles(true);
        grida.devtools_rendering_set_show_fps_meter(true);
        grida.devtools_rendering_set_show_stats(false);
        grida.devtools_rendering_set_show_hit_testing(true);
        grida.devtools_rendering_set_show_ruler(true);

        rendererRef.current = grida;

        grida.loadScene(__test_document);

        const loop = () => {
          grida.redraw();
          requestAnimationFrame(loop);
        };

        loop();
      });
    }
  }, []);

  return (
    <main className="w-dvw h-dvh flex flex-col gap-10">
      <div className="flex-1 flex">
        <aside className="flex-1 relative">
          <canvas
            ref={canvasRef}
            width={1000}
            height={1000}
            className="absolute inset-0 z-10 bg-transparent"
          />
        </aside>
      </div>
    </main>
  );
}
