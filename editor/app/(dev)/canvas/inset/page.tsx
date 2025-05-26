"use client";

import * as React from "react";
import {
  EditorSurface,
  StandaloneSceneContent,
  ViewportRoot,
} from "@/grida-react-canvas";
import { DevtoolsPanel } from "@/grida-react-canvas/devtools";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
} from "@/grida-react-canvas/renderer";
import { useEditor } from "@/grida-react-canvas";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { StandaloneDocumentEditor } from "@/grida-react-canvas/provider";

export default function CanvasV2Page() {
  const editor = useEditor({
    debug: false,
    document: {
      scenes: {
        main: {
          id: "main",
          name: "main",
          constraints: {
            children: "multiple",
          },
          children: ["rect"],
        },
      },
      nodes: {
        rect: {
          id: "rect",
          type: "rectangle",
          active: true,
          locked: false,
          name: "a",
          width: 100,
          height: 100,
          position: "relative",
          zIndex: 0,
          opacity: 1,
          rotation: 0,
          cornerRadius: 0,
          fill: {
            type: "solid",
            color: { r: 0, g: 0, b: 0, a: 1 },
          },
          effects: [],
          strokeWidth: 0,
          strokeCap: "butt",
        },
      },
    },
    editable: true,
  });

  //
  return (
    <main className="w-screen h-screen p-10">
      <StandaloneDocumentEditor editor={editor}>
        <Hotkyes />
        <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
          <ViewportRoot className="relative w-full h-full overflow-hidden">
            <EditorSurface />
            <AutoInitialFitTransformer>
              <StandaloneSceneContent />
            </AutoInitialFitTransformer>
          </ViewportRoot>
          <DevtoolsPanel />
        </StandaloneSceneBackground>
      </StandaloneDocumentEditor>
    </main>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
