"use client";

import React from "react";
import {
  Align,
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import {
  NodeHierarchyGroup,
  ScenesGroup,
} from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
} from "@/grida-react-canvas";
import { editor } from "@/grida-canvas";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGoogleFontsList } from "@/grida-react-canvas/components/google-fonts";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useEditor } from "@/grida-react-canvas";

export default function MinimalCanvasDemo() {
  const fonts = useGoogleFontsList();
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
            children: [],
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
            <Sidebar side="right" variant="floating">
              <SidebarHeader className="border-b">
                <div className="flex items-center justify-end gap-2">
                  <Zoom
                    className={cn(
                      WorkbenchUI.inputVariants({
                        variant: "input",
                        size: "xs",
                      }),
                      "w-auto"
                    )}
                  />
                </div>
                <hr />
                <Align />
              </SidebarHeader>
              <SidebarContent>
                <FontFamilyListProvider fonts={fonts}>
                  <Selection />
                </FontFamilyListProvider>
              </SidebarContent>
            </Sidebar>
          </StandaloneDocumentEditor>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
