"use client";
import * as React from "react";
import {
  AutoInitialFitTransformer,
  EditorSurface,
  StandaloneDocumentEditor,
  StandaloneSceneBackground,
  StandaloneSceneContent,
  useEditor,
  ViewportRoot,
} from "@/grida-canvas-react";
import { WindowCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import { Hotkeys } from "@/grida-canvas-react/viewport/hotkeys";
import init, { type Grida2D } from "@grida/canvas-wasm";

export default function CanvasWasmExperimentalPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<Grida2D | null>(null);
  const editor = useEditor();

  React.useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      const canvasel = canvasRef.current;
      init({
        locateFile: (path) => {
          if (process.env.NODE_ENV === "development") {
            return `http://localhost:4020/dist/${path}`;
          }
          return `https://unpkg.com/@grida/canvas-wasm@latest/dist/${path}`;
        },
      }).then((factory) => {
        console.log("grida wasm initialized");
        const grida = factory.createWebGLCanvasSurface(canvasel);
        grida.devtools_rendering_set_show_tiles(true);
        grida.devtools_rendering_set_show_fps_meter(true);
        grida.devtools_rendering_set_show_stats(false);
        grida.devtools_rendering_set_show_hit_testing(true);
        grida.devtools_rendering_set_show_ruler(true);

        rendererRef.current = grida;
        editor.subscribeWithSelector(
          (state) => state.document.nodes,
          (editor, selected) => {
            const scenedata = {
              version: "0.0.1-beta.1+20250303",
              document: editor.state.document,
            };
            requestAnimationFrame(() => {
              grida.loadScene(JSON.stringify(scenedata));
              grida.redraw();
              grida.resize(canvasel.width, canvasel.height);
            });
          }
        );
      });
    }
  }, []);

  return (
    <main className="w-dvw h-dvh flex flex-col gap-10">
      <header className="w-full flex items-center justify-center">
        <h1 className="text-2xl font-bold">
          Grida Canvas <span className="text-sm font-mono">SKIA BACKEND</span>
        </h1>
      </header>
      <div className="flex-1 flex">
        <aside className="flex-1 border-r">
          <StandaloneDocumentEditor editor={editor}>
            <WindowCurrentEditorProvider />
            <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
              <ViewportRoot className="relative w-full h-full overflow-hidden">
                <Hotkeys />
                <EditorSurface />
                <AutoInitialFitTransformer>
                  <StandaloneSceneContent />
                </AutoInitialFitTransformer>
              </ViewportRoot>
            </StandaloneSceneBackground>
          </StandaloneDocumentEditor>
        </aside>
        <aside className="flex-1 relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="absolute inset-0 z-10 bg-transparent"
          />
        </aside>
      </div>
    </main>
  );
}
