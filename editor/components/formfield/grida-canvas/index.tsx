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
import { NodeHierarchyList } from "@/grida-react-canvas-starter-kit/starterkit-hierarchy";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
} from "@/grida-react-canvas";
import standaloneDocumentReducer from "@/grida-canvas/reducers";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useGoogleFontsList } from "@/grida-react-canvas/components/google-fonts";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui-editor/dialog";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import { Card } from "@/components/ui/card";
import { PenToolIcon } from "lucide-react";
import { editor } from "@/grida-canvas";

export function GridaCanvasFormField() {
  useDisableSwipeBack();
  const fonts = useGoogleFontsList();
  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
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

  useEffect(() => {
    fetch("/examples/canvas/sketch-teimplate-01.grida").then((res) => {
      res.json().then((file) => {
        dispatch({
          type: "__internal/reset",
          key: "template",
          state: editor.state.init({
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
        className="!max-w-screen-xl overflow-hidden select-none p-0"
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
                        <StandaloneSceneContent />
                      </AutoInitialFitTransformer>
                      <ToolbarPosition>
                        <Toolbar />
                      </ToolbarPosition>
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
