"use client";

import React from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import { SideControl } from "@/scaffolds/sidecontrol";
import BlocksEditor from "@/scaffolds/blocks-editor";
import { Spinner } from "@/components/spinner";

export default function EditFormPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto bg-transparent">
        <CanvasOverlay />
        <AgentThemeProvider>
          <CurrentPageCanvas />
        </AgentThemeProvider>
      </CanvasEventTarget>
      <aside className="hidden lg:flex h-full">
        <SideControl />
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

  const clearselection = () => dispatch({ type: "blocks/blur" });

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
    theme: { lang },
    selected_page_id,
  } = state;

  switch (selected_page_id) {
    case "form":
      return <BlocksEditor />;

    default:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <Spinner />
        </div>
      );
  }
}
