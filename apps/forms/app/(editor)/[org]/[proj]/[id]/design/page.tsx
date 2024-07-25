"use client";

import React from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import { Siebar } from "@/scaffolds/sidebar/sidebar";
import { SideControl } from "@/scaffolds/sidecontrol";
import BlocksEditor from "@/scaffolds/blocks-editor";
import FormCollectionPage from "@/theme/templates/formcollection/page";
import FormStartPage from "@/theme/templates/formstart/default/page";
import { CanvasFloatingToolbar } from "@/scaffolds/canvas-floating-toolbar";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { EndingRedirectPreferences } from "@/scaffolds/settings/customize/custom-ending-redirect-preferences";
import { EndingPageI18nOverrides, FormDocument } from "@/types";
import { EndingPagePreferences } from "@/scaffolds/settings/customize/custom-ending-page-preferences";

export default function EditFormPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <aside className="hidden lg:flex h-full">
        <Siebar mode="design" />
      </aside>
      <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto">
        <CanvasOverlay />
        <AgentThemeProvider>
          <CurrentPageCanvas />
        </AgentThemeProvider>
      </CanvasEventTarget>
      <aside className="hidden lg:flex h-full">
        <SideControl mode="design" />
      </aside>
    </main>
  );
}

function CanvasEventTarget({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const [state, dispatch] = useEditorState();

  const clearselection = () =>
    dispatch({ type: "editor/document/node/select" });

  return (
    <div className={className} onPointerDown={clearselection}>
      {children}
    </div>
  );
}

function CanvasOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="w-full h-full" id="canvas-overlay-portal" />
    </div>
  );
}

function CurrentPageCanvas() {
  const [state, dispatch] = useEditorState();

  const {
    form_title,
    form_id,
    theme: { lang },
    document: { selected_page_id },
  } = state;

  switch (selected_page_id) {
    case "form":
      return <BlocksEditor />;
    case "collection":
      return (
        <>
          {/* // 430 932 max-h-[932px] no-scrollbar overflow-y-scroll */}
          <div className="mx-auto my-20 max-w-[430px] border rounded-2xl shadow-2xl bg-background select-none">
            <FormCollectionPage />
          </div>
          <div className="fixed bottom-5 left-0 right-0 flex items-center justify-center z-50">
            <CanvasFloatingToolbar />
          </div>
        </>
      );
    case "start": {
      return (
        <div className="mx-auto my-20 max-w-[430px] border rounded-2xl shadow-2xl bg-background overflow-hidden">
          <FormStartPage />
        </div>
      );
    }
    case "ending": {
      // FIXME:
      const is_redirect_after_response_uri_enabled = true;
      const redirect_after_response_uri = "https://google.com";
      const is_ending_page_enabled = true;
      const ending_page_template_id = "default";
      const ending_page_i18n_overrides = {};
      return (
        <main className="max-w-2xl mx-auto">
          <Sector>
            <SectorHeader>
              <SectorHeading>Ending</SectorHeading>
              <SectorDescription>
                Redirect or show custom page after form submission
              </SectorDescription>
            </SectorHeader>
            <SectorBlocks>
              <EndingRedirectPreferences
                form_id={form_id}
                init={{
                  is_redirect_after_response_uri_enabled:
                    is_redirect_after_response_uri_enabled,
                  redirect_after_response_uri:
                    redirect_after_response_uri ?? "",
                }}
              />
              <EndingPagePreferences
                form_id={form_id}
                lang={lang}
                title={form_title}
                init={{
                  enabled: is_ending_page_enabled,
                  template_id: ending_page_template_id as any,
                  i18n_overrides:
                    ending_page_i18n_overrides as {} as EndingPageI18nOverrides,
                }}
              />
            </SectorBlocks>
          </Sector>
        </main>
      );
    }
    default:
      return <>UNKNOWN PAGE {selected_page_id}</>;
  }
}
