"use client";

import React from "react";
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
import TMP_Invite from "@/app/(demo)/demo/sales/campaign/polestar-kr-2503/[cid]/invite/component";
import TMP_Portal from "@/app/(demo)/demo/sales/campaign/polestar-kr-2503/portal/component";

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
                      "tmp-2503-invite": CustomComponent__Invite,
                      "tmp-2503-join": CustomComponent__Join,
                      "tmp-2503-portal": CustomComponent__Portal,
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

function CustomComponent__Invite(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        width: 375,
        height: 812,
      }}
      {...queryattributes(props)}
    >
      <TMP_Invite params={{ cid: "00000000" }} />
    </div>
  );
}

function CustomComponent__Join(props: any) {
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

function CustomComponent__Portal(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        width: 375,
        height: 812,
      }}
      {...queryattributes(props)}
    >
      <TMP_Portal />
    </div>
  );
}
