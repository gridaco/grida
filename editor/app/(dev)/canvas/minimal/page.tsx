"use client";

import React from "react";
import {
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import {
  ScenesGroup,
  NodeHierarchyGroup,
} from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
  AutoInitialFitTransformer,
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react";
import { editor } from "@/grida-canvas";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useEditorHotKeys } from "@/grida-canvas-react/viewport/hotkeys";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useEditor } from "@/grida-canvas-react";

export default function MinimalCanvasDemo() {
  const instance = useEditor(
    editor.state.init({
      editable: true,
      document: {
        nodes: {},
        scenes: {
          main: {
            type: "scene",
            id: "main",
            name: "main",
            children_refs: [],
            guides: [],
            constraints: {
              children: "multiple",
            },
          },
        },
      },
    })
  );

  return (
    <TooltipProvider>
      <SidebarProvider>
        <main className="w-screen h-screen overflow-hidden select-none">
          <StandaloneDocumentEditor editor={instance}>
            <Hotkyes />
            <Sidebar side="left" variant="floating">
              <SidebarContent>
                <ScenesGroup />
                <hr />
                <NodeHierarchyGroup />
              </SidebarContent>
            </Sidebar>
            <div className="fixed inset-0 flex w-full h-full">
              <EditorSurfaceClipboardSyncProvider>
                <EditorSurfaceDropzone>
                  <EditorSurfaceContextMenu>
                    <div className="w-full h-full flex flex-col relative bg-black/5">
                      <ViewportRoot className="relative w-full h-full overflow-hidden">
                        <EditorSurface />
                        <AutoInitialFitTransformer>
                          <StandaloneSceneContent />
                        </AutoInitialFitTransformer>
                        <ToolbarPosition>
                          <Toolbar />
                        </ToolbarPosition>
                      </ViewportRoot>
                    </div>
                  </EditorSurfaceContextMenu>
                </EditorSurfaceDropzone>
              </EditorSurfaceClipboardSyncProvider>
            </div>
            <SidebarRight />
          </StandaloneDocumentEditor>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function SidebarRight() {
  const editor = useCurrentEditor();
  const fonts = useEditorState(editor, (state) => state.webfontlist.items);

  return (
    <Sidebar side="right" variant="floating">
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-end gap-2">
          <Zoom
            className={cn(
              WorkbenchUI.inputVariants({ variant: "input", size: "xs" }),
              "w-auto"
            )}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <FontFamilyListProvider fonts={fonts}>
          <Selection />
        </FontFamilyListProvider>
      </SidebarContent>
    </Sidebar>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
