"use client";

import React from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import {
  ViewportRoot,
  EditorSurface,
  StandaloneDocumentContent,
} from "@/grida-react-canvas";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
} from "@/grida-react-canvas/renderer";
import { SideControl } from "@/scaffolds/sidecontrol";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import _002 from "@/theme/templates/formstart/002/page";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";

export default function SiteDeisngPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <CurrentPageCanvas />
    </main>
  );
}

function CurrentPageCanvas() {
  useEditorHotKeys();

  return (
    <div className="flex w-full h-full">
      <EditorSurfaceClipboardSyncProvider>
        <EditorSurfaceDropzone>
          <EditorSurfaceContextMenu>
            <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
              <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
                <EditorSurface />
                <AutoInitialFitTransformer>
                  <StandaloneDocumentContent
                    templates={{
                      "tmp-2503-invite": CustomComponent,
                      "tmp-2503-join": CustomComponent,
                      "tmp-2503-portal": CustomComponent,
                    }}
                  />
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
    </div>
  );
}

function CustomComponent(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        width: 375,
        height: 812,
      }}
      {...queryattributes(props)}
    >
      <_002 />
    </div>
  );
}
