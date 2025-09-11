import { useLayoutEffect, useRef } from "react";
import init, { Grida2D } from "@grida/canvas-wasm";
import locateFile from "./locate-file";

export function useGrida2D(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const rendererRef = useRef<Grida2D | null>(null);
  const isInitializedRef = useRef(false);

  useLayoutEffect(() => {
    if (canvasRef.current && !isInitializedRef.current) {
      const canvasel = canvasRef.current;
      isInitializedRef.current = true;

      init({
        locateFile: locateFile,
      }).then((factory) => {
        const grida = factory.createWebGLCanvasSurface(canvasel);
        grida.runtime_renderer_set_cache_tile(false);
        // grida.setDebug(true);
        // grida.setVerbose(true);

        rendererRef.current = grida;
        console.log("grida wasm initialized");

        if (process.env.NEXT_PUBLIC_GRIDA_WASM_VERBOSE === "1") {
          grida.setVerbose(true);
          grida.setDebug(true);
          console.log("wasm::factory", factory);
        }
      });
    }
  }, [canvasRef]);

  return rendererRef;
}
