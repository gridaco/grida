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

// const imageNode: grida.program.nodes.ImageNode = {
//   type: "image",
//   id: "1",
//   name: "Image",
//   active: true,
//   locked: false,
//   style: {},
//   opacity: 1,
//   rotation: 0,
//   zIndex: 0,
//   position: "absolute",
//   left: 300,
//   top: 300,
//   width: 100,
//   height: 100,
//   fit: "contain",
//   src: "/images/abstract-placeholder.jpg",
//   cornerRadius: 0,
// };

// const textNode: grida.program.nodes.TextNode = {
//   type: "text",
//   id: "1",
//   name: "Text",
//   active: true,
//   locked: false,
//   style: {},
//   fontFamily: "Arial",
//   opacity: 1,
//   rotation: 0,
//   zIndex: 0,
//   position: "absolute",
//   width: 200,
//   height: 100,
//   textAlign: "left",
//   textAlignVertical: "top",
//   textDecoration: "none",
//   fontSize: 16,
//   fontWeight: 100,
//   text: "Hello, world!",
// };

// const lineNode: grida.program.nodes.LineNode = {
//   type: "line",
//   id: "1",
//   name: "Line",
//   active: true,
//   locked: false,
//   height: 0,
//   top: 50,
//   left: 100,
//   position: "absolute",
//   stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
//   strokeWidth: 1,
//   strokeCap: "butt",
//   width: 200,
//   opacity: 1,
//   zIndex: 0,
//   rotation: 0,
// };

export default function SkiaCanvasKitExperimentalPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // const rendererRef = React.useRef<CanvasKitRenderer | null>(null);
  const editor = useEditor();

  React.useEffect(() => {
    // if (canvasRef.current && !rendererRef.current) {
    //   const renderer = new CanvasKitRenderer(canvasRef.current);
    //   rendererRef.current = renderer;
    //   editor.subscribeWithSelector(
    //     (state) => state.document.nodes,
    //     (editor, selected) => {
    //       rendererRef.current?.setDocument(
    //         selected,
    //         editor.state.document.scenes["main"].children[0]
    //       );
    //     }
    //   );
    // }
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
