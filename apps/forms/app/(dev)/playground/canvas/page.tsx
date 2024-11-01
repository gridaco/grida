"use client";

import React, { useState } from "react";
import { SidebarRoot } from "@/components/sidebar";
import { SelectedNodeProperties } from "@/scaffolds/sidecontrol/sidecontrol-selected-node";
import {
  StandaloneDocumentEditor,
  StandaloneDocumentEditorContent,
  CanvasEventTarget,
  CanvasOverlay,
  type IDocumentEditorState,
} from "@/builder";

export default function CanvasPlaygroundPage() {
  const [state, setState] = useState<IDocumentEditorState>({
    editable: true,
    document: {
      root_id: "playground",
      nodes: {
        playground: {
          id: "playground",
          name: "playground",
          type: "container",
          active: true,
          locked: false,
          expanded: true,
          style: {},
        },
      },
    },
  });

  return (
    <main className="w-screen h-screen overflow-hidden">
      <StandaloneDocumentEditor
        state={state}
        // dispatch={}
      >
        <div className="flex w-full h-full">
          <div className="bg-red-200 w-full h-full">
            <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto bg-transparent pointer-events-none">
              <CanvasOverlay />
              <StandaloneDocumentEditorContent />
            </CanvasEventTarget>
          </div>
          <aside className="hidden lg:flex h-full">
            <SidebarRoot side="right">
              {state.selected_node_id && <SelectedNodeProperties />}
            </SidebarRoot>
          </aside>
        </div>
      </StandaloneDocumentEditor>
    </main>
  );
}
