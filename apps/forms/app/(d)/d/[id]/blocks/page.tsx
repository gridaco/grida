"use client";

import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import { Siebar } from "@/scaffolds/sidebar/sidebar";
import { SideControl } from "@/scaffolds/sidecontrol";
import BlocksEditor from "@/scaffolds/blocks-editor";
import FormCollectionPage from "@/theme/templates/formcollection/page";
import FormStartPage from "@/theme/templates/formstart/default/page";
import React from "react";
import { CanvasFloatingToolbar } from "@/scaffolds/canvas-floating-toolbar";

export default function EditFormPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <aside className="hidden lg:flex h-full">
        <Siebar mode="blocks" />
      </aside>
      <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto">
        <CanvasOverlay />
        <AgentThemeProvider>
          <CurrentPageCanvas />
        </AgentThemeProvider>
      </CanvasEventTarget>
      <aside className="hidden lg:flex h-full">
        <SideControl mode="blocks" />
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

  switch (state.document.selected_page_id) {
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
    default:
      return <>TODO</>;
  }
}
