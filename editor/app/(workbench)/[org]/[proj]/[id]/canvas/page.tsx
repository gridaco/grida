"use client";
import React from "react";
import { Spinner } from "@/components/spinner";
import {
  EditorSurface,
  StandaloneSceneContent,
  ViewportRoot,
} from "@/grida-react-canvas";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useEditorState } from "@/scaffolds/editor";
import { SideControl } from "@/scaffolds/sidecontrol";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
} from "@/grida-react-canvas/renderer";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import { PreviewProvider } from "@/grida-react-canvas-starter-kit/starterkit-preview";

export default function CanvasPage() {
  const [state] = useEditorState();

  const {
    documents: { canvas: document },
  } = state;

  if (!document) {
    return <Spinner />;
  }

  return <GridaCanvas />;
}

function GridaCanvas() {
  return (
    <>
      <div className="flex w-full h-full">
        <PreviewProvider>
          <Hotkeys />
          <EditorSurfaceClipboardSyncProvider>
            <EditorSurfaceDropzone>
              <EditorSurfaceContextMenu>
                <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                  <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
                    <EditorSurface />
                    <AutoInitialFitTransformer>
                      <StandaloneSceneContent />
                    </AutoInitialFitTransformer>
                    <ToolbarPosition>
                      <Toolbar />
                    </ToolbarPosition>
                  </ViewportRoot>
                </StandaloneSceneBackground>
              </EditorSurfaceContextMenu>
            </EditorSurfaceDropzone>
          </EditorSurfaceClipboardSyncProvider>
          <aside className="hidden lg:flex h-full">
            <SideControl />
          </aside>
        </PreviewProvider>
      </div>
    </>
  );
}

function Hotkeys() {
  useEditorHotKeys();
  return null;
}
