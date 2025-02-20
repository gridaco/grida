"use client";

import React, { useEffect, useReducer } from "react";
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
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useGoogleFontsList } from "@/grida-fonts/react/hooks";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import Toolbar from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import { Card } from "@/components/ui/card";
import { PenToolIcon } from "lucide-react";

export function GridaCanvasFormField() {
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

  useEffect(() => {
    fetch("/examples/canvas/sketch-teimplate-01.grida").then((res) => {
      res.json().then((file) => {
        dispatch({
          type: "__internal/reset",
          key: "template",
          state: initDocumentEditorState({
            editable: true,
            document: file.document,
          }),
        });
      });
    });
  }, []);

  return (
    <Dialog>
      <DialogTrigger>
        <Card>
          <div className="flex items-center justify-center h-40 w-full rounded-md">
            <p className="text-muted-foreground text-center">
              <span>
                <PenToolIcon className="inline me-2 align-middle" />
              </span>
              <br />
              <span className="text-xs text-muted-foreground">
                Design from here
              </span>
            </p>
          </div>
        </Card>
      </DialogTrigger>
      <DialogContent
        className="max-w-screen-xl overflow-hidden select-none p-0"
        style={{ height: "calc(100vh - 4rem)" }}
        hideCloseButton
      >
        <StandaloneDocumentEditor editable initial={state} dispatch={dispatch}>
          <Hotkyes />
          <div className="flex w-full h-full">
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
            <SidebarRoot className="absolute left-4 top-4 bottom-4 h-full rounded-xl overflow-hidden bg-background z-50">
              <hr />
              <SidebarSection>
                <SidebarSectionHeaderItem>
                  <SidebarSectionHeaderLabel>Layers</SidebarSectionHeaderLabel>
                </SidebarSectionHeaderItem>
                <NodeHierarchyList />
              </SidebarSection>
            </SidebarRoot>
            <SidebarRoot
              side="right"
              className="absolute right-4 top-4 bottom-4 h-full rounded-xl overflow-hidden bg-background z-50"
            >
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
          </div>
        </StandaloneDocumentEditor>
      </DialogContent>
    </Dialog>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
