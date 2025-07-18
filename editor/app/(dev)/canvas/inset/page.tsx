"use client";

import * as React from "react";
import {
  EditorSurface,
  StandaloneSceneContent,
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  ViewportRoot,
  useCurrentEditor,
} from "@/grida-canvas-react";
import { DevtoolsPanel } from "@/grida-canvas-react/devtools";
import { useEditor } from "@/grida-canvas-react";
import { useEditorHotKeys } from "@/grida-canvas-react/viewport/hotkeys";
import { StandaloneDocumentEditor } from "@/grida-canvas-react/provider";

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
          <DebugSlice />
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

function DebugSlice() {
  const [count, setCount] = React.useState(0);
  const editor = useCurrentEditor();

  console.log("editor", editor);

  React.useEffect(() => {
    setCount((c) => c + 1);
  }, [editor]);

  return <div>Did I Update? {count}</div>;
}
