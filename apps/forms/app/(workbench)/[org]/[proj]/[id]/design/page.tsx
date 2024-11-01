"use client";

import React, { useCallback } from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import { SideControl } from "@/scaffolds/sidecontrol";
import FormCollectionPage from "@/theme/templates/formcollection/page";
import { CanvasFloatingToolbar } from "@/scaffolds/canvas-floating-toolbar";
import { CanvasEventTarget, CanvasOverlay } from "@/builder/canvas/canvas";
import { composeEditorDocumentAction } from "@/scaffolds/editor/action";
import { BuilderAction } from "@/builder/action";
import { StandaloneDocumentEditor } from "@/builder/provider";

export default function SiteDeisngPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <CurrentPageCanvas />
    </main>
  );
}

function CurrentPageCanvas() {
  const [state, dispatch] = useEditorState();

  const {
    theme: { lang },
    selected_page_id,
    documents,
  } = state;

  // @ts-ignore
  const document = documents[selected_page_id!];

  const documentDispatch = useCallback(
    (action: BuilderAction) => {
      dispatch(
        composeEditorDocumentAction(
          // @ts-ignore
          selected_page_id!,
          action
        )
      );
    },
    [selected_page_id, dispatch]
  );

  switch (selected_page_id) {
    case "site/dev-collection":
      return (
        <StandaloneDocumentEditor state={document} dispatch={documentDispatch}>
          <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto bg-transparent">
            <CanvasOverlay />
            <>
              <AgentThemeProvider>
                {/* // 430 932 max-h-[932px] no-scrollbar overflow-y-scroll */}
                <div className="mx-auto my-20 max-w-[430px] border rounded-2xl shadow-2xl bg-background select-none">
                  <FormCollectionPage />
                </div>
              </AgentThemeProvider>
              <div className="fixed bottom-5 left-0 right-0 flex items-center justify-center z-50">
                <CanvasFloatingToolbar />
              </div>
            </>
          </CanvasEventTarget>
          <aside className="hidden lg:flex h-full">
            <SideControl />
          </aside>
        </StandaloneDocumentEditor>
      );

    default:
      return <>UNKNOWN PAGE {selected_page_id}</>;
  }
}
