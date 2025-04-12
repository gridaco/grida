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
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";

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
          "tmp-2503-invite": CustomComponent__Referrer,
          "tmp-2503-join": CustomComponent__Join,
          "tmp-2503-join-hello": CustomComponent__Join_Hello,
          "tmp-2503-portal": CustomComponent__Portal,
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

function CustomComponent__Referrer(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <ReferrerPageTemplate
        design={{
          brand_name: "Apple",
          title: props.title as string,
          description: props.description as string,
          logo: {
            src: "/logos/thebundle.png",
            srcDark: "/logos/thebundle-dark.png",
          },
          favicon: {
            src: "https://www.apple.com/favicon.ico",
            srcDark: "https://www.apple.com/favicon.ico",
          },
          article: {
            html: props.article as string,
          },
          cta: {
            text: "Join Now",
          },
          image: {
            src: "/images/abstract-placeholder.jpg",
            alt: "Example Image",
          },
          footer: {
            link_privacy: "/privacy",
            link_instagram: "https://www.instagram.com/polestarcars/",
            paragraph: {
              html: "1. Hearing Aid and Hearing Test: The Hearing Aid feature has received FDA authorization. The Hearing Test and Hearing Aid features are supported on AirPods Pro 2 with the latest firmware paired with a compatible iPhone or iPad with iOS 18 or iPadOS 18 and later and are intended for people 18 years old or older. The Hearing Aid feature is also supported on a compatible Mac with macOS Sequoia and later. It is intended for people with perceived mild to moderate hearing loss.",
            },
          },
        }}
        locale="en"
        slug="dummy"
        data={{
          campaign: {
            id: "dummy",
            title: "DUMMY",
            enabled: true,
            conversion_currency: "USD",
            conversion_value: 0,
            max_invitations_per_referrer: 10,
            reward_currency: "USD",
            public: null,
            scheduling_close_at: null,
            scheduling_open_at: null,
            scheduling_tz: null,
          },
          code: "dummy",
          created_at: "2025-10-01T00:00:00Z",
          invitation_count: 0,
          invitations: [],
          type: "referrer",
          id: "123",
          referrer_name: "DUMMY",
        }}
      />
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
      {/* <Portal /> */}
    </div>
  );
}
