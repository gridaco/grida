"use client";
import React from "react";
import { Spinner } from "@/components/spinner";
import {
  EditorSurface,
  StandaloneSceneContent,
  ViewportRoot,
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
} from "@/grida-canvas-react";
import { useEditorHotKeys } from "@/grida-canvas-react/viewport/hotkeys";
import { useEditorState } from "@/scaffolds/editor";
import { SideControl } from "@/scaffolds/sidecontrol";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import { PreviewProvider } from "@/grida-canvas-react-starter-kit/starterkit-preview";

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
