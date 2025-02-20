"use client";

import React, { useReducer } from "react";
import {
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import {
  Align,
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { NodeHierarchyList } from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneDocumentContent,
  ViewportRoot,
  EditorSurface,
  standaloneDocumentReducer,
  initDocumentEditorState,
} from "@/grida-react-canvas";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { HelpFab } from "@/scaffolds/help/editor-help-fab";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGoogleFontsList } from "@/grida-fonts/react/hooks";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import Toolbar from "@/grida-react-canvas-starter-kit/starterkit-toolbar";

export default function CanvasPlayground() {
  useDisableSwipeBack();
  const fonts = useGoogleFontsList();
  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
    initDocumentEditorState({
      editable: true,
      document: {
        nodes: {
          root: {
            id: "root",
            name: "root",
            active: true,
            locked: false,
            type: "container",
            children: [],
            width: 800,
            height: 600,
            position: "relative",
            style: {},
            opacity: 1,
            zIndex: 0,
            rotation: 0,
            expanded: false,
            cornerRadius: 0,
            padding: 0,
            layout: "flow",
            direction: "horizontal",
            mainAxisAlignment: "start",
            crossAxisAlignment: "start",
            mainAxisGap: 0,
            crossAxisGap: 0,
          },
        },
        root_id: "root",
      },
    })
  );

  return (
    <TooltipProvider>
      <main className="w-screen h-screen overflow-hidden select-none">
        <StandaloneDocumentEditor editable initial={state} dispatch={dispatch}>
          <Hotkyes />
          <div className="flex w-full h-full">
            <aside className="absolute left-4 top-4 bottom-4 h-full rounded-xl overflow-hidden bg-background z-50">
              <SidebarRoot>
                <hr />
                <SidebarSection>
                  <SidebarSectionHeaderItem>
                    <SidebarSectionHeaderLabel>
                      Layers
                    </SidebarSectionHeaderLabel>
                  </SidebarSectionHeaderItem>
                  <NodeHierarchyList />
                </SidebarSection>
              </SidebarRoot>
            </aside>
            <EditorSurfaceClipboardSyncProvider>
              <EditorSurfaceDropzone>
                <EditorSurfaceContextMenu>
                  <div className="w-full h-full flex flex-col relative bg-black/5">
                    <ViewportRoot className="relative w-full h-full overflow-hidden">
                      <EditorSurface />
                      <AutoInitialFitTransformer>
                        <StandaloneDocumentContent />
                      </AutoInitialFitTransformer>

                      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
                        <Toolbar />
                      </div>
                    </ViewportRoot>
                    {/* <DevtoolsPanel /> */}
                  </div>
                </EditorSurfaceContextMenu>
              </EditorSurfaceDropzone>
            </EditorSurfaceClipboardSyncProvider>

            <aside className="absolute right-4 top-4 bottom-4 h-full rounded-xl overflow-hidden bg-background z-50">
              <SidebarRoot side="right">
                <div className="p-2">
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
                </div>
                <hr />
                <FontFamilyListProvider fonts={fonts}>
                  <Align />
                  <hr />
                  <Selection />
                </FontFamilyListProvider>
              </SidebarRoot>
            </aside>
          </div>
        </StandaloneDocumentEditor>
        <HelpFab />
      </main>
    </TooltipProvider>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
