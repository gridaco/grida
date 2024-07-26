"use client";

import React from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
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
import { EndingPagePreferences } from "@/scaffolds/settings/customize/custom-ending-page-preferences";
import { ClosingFormPreferences } from "@/scaffolds/settings/closing-preference";
import { SchedulingPreferences } from "@/scaffolds/settings/scheduling-preference";
import {
  MaxRespoonses,
  RestrictNumberOfResponseByCustomer,
} from "@/scaffolds/settings/response-preferences";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-dynamic-field-preferences";
import { FormMethodPreference } from "@/scaffolds/settings/form-method-preference";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origin-preferences";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";

export default function EditFormPage() {
  return (
    <main className="h-full flex flex-1 w-full">
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
    case "campaign": {
      return (
        <main className="max-w-2xl mx-auto">
          <Sector>
            <SectorHeader>
              <SectorHeading>General</SectorHeading>
            </SectorHeader>
            <AboutThisForm form_id={form_id} />
          </Sector>
          <Sector id="access">
            <SectorHeader>
              <SectorHeading>Access</SectorHeading>
              <SectorDescription>
                Manage how responses are collected and protected
              </SectorDescription>
            </SectorHeader>
            <SectorBlocks>
              <ClosingFormPreferences />
              <SchedulingPreferences />
              <RestrictNumberOfResponseByCustomer />
              <MaxRespoonses />
            </SectorBlocks>
          </Sector>
          <Sector>
            <SectorHeader>
              <SectorHeading>Data</SectorHeading>
            </SectorHeader>
            <SectorBlocks>
              <UnknownFieldPreferences />
              <FormMethodPreference />
            </SectorBlocks>
          </Sector>
          <Sector>
            <SectorHeader>
              <SectorHeading>Security</SectorHeading>
              <SectorDescription>
                Configure where the form can be embedded
              </SectorDescription>
            </SectorHeader>
            <TrustedOriginPreferences />
          </Sector>
          <Sector>
            <SectorHeader>
              <SectorHeading className="text-destructive">
                Danger Zone
              </SectorHeading>
            </SectorHeader>
            <DeleteFormSection />
          </Sector>
        </main>
      );
    }
    case "ending": {
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
              <EndingRedirectPreferences />
              <EndingPagePreferences />
            </SectorBlocks>
          </Sector>
        </main>
      );
    }
    default:
      return <>UNKNOWN PAGE {selected_page_id}</>;
  }
}
