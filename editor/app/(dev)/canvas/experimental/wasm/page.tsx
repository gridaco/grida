"use client";
import * as React from "react";
import {
  AutoInitialFitTransformer,
  EditorSurface,
  StandaloneDocumentEditor,
  StandaloneSceneBackground,
  StandaloneSceneContent,
  useEditor,
  useEditorState,
  ViewportRoot,
} from "@/grida-canvas-react";
import { WindowCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import { Hotkeys } from "@/grida-canvas-react/viewport/hotkeys";
import Canvas from "@/grida-canvas-wasm-react";

export default function CanvasWasmExperimentalPage() {
  const editor = useEditor();
  const document = useEditorState(editor, (state) => state.document);
  const transform = useEditorState(editor, (state) => state.transform);

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
          <Canvas
            width={800}
            height={600}
            transform={transform}
            data={document}
          />
        </aside>
      </div>
    </main>
  );
}
