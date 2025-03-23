"use client";

import React from "react";
import {
  ViewportRoot,
  EditorSurface,
  StandaloneSceneContent,
  useDocument,
} from "@/grida-react-canvas";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  UserCustomTemplatesProvider,
} from "@/grida-react-canvas/renderer";
import { SideControl } from "@/scaffolds/sidecontrol";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import _002 from "@/theme/templates/formstart/002/page";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import { PreviewProvider } from "@/grida-react-canvas-starter-kit/starterkit-preview";
import { CustomCSSProvider } from "@/scaffolds/css/css-provider";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";
import Invite from "@/app/(demo)/r/[slug]/[code]/_invite";
import Portal from "@/app/(demo)/r/[slug]/(portal)/_flows/page";
import Verify from "@/app/(demo)/r/[slug]/(portal)/_flows/step-verify";
import Main from "@/app/(demo)/r/[slug]/[code]/_join/_flows/main";
import Hello from "@/app/(demo)/r/[slug]/[code]/_join/_flows/hello";

export default function SiteDeisngPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <CurrentPageCanvas />
    </main>
  );
}

function CurrentPageCanvas() {
  useEditorHotKeys();
  useDisableSwipeBack();

  const { state } = useDocument();

  const customcss = state.document.properties["user-custom-css"];

  // console.log("customcss", customcss);

  return (
    <div className="flex w-full h-full">
      <UserCustomTemplatesProvider
        templates={{
          "tmp-2503-invite": CustomComponent__Invite,
          "tmp-2503-join": CustomComponent__Join,
          "tmp-2503-join-hello": CustomComponent__Join_Hello,
          "tmp-2503-portal": CustomComponent__Portal,
          "tmp-2503-portal-verify": CustomComponent__Portal_Verify,
        }}
      >
        <PreviewProvider>
          <EditorSurfaceClipboardSyncProvider>
            <EditorSurfaceDropzone>
              <EditorSurfaceContextMenu>
                <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                  <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
                    <EditorSurface />
                    <AutoInitialFitTransformer>
                      <CustomCSSProvider
                        scope="custom"
                        css={customcss?.default}
                      >
                        <StandaloneSceneContent />
                      </CustomCSSProvider>
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
      </UserCustomTemplatesProvider>
    </div>
  );
}

function CustomComponent__Invite(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/* <Invite params={{ code: "00000000" }} /> */}
    </div>
  );
}

function CustomComponent__Join(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/* <Main
        data={{
          cid: "00000000",
          user: {
            name: "DUMMY",
          },
        }}
      /> */}
    </div>
  );
}

function CustomComponent__Join_Hello(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/* <_002 /> */}
      {/* <Hello
        data={{
          cid: "",
          user: {
            name: "DUMMY",
          },
        }}
      /> */}
    </div>
  );
}

function CustomComponent__Portal(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <Portal />
    </div>
  );
}

function CustomComponent__Portal_Verify(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <Verify />
    </div>
  );
}
