"use client";

import { CanvasEventTarget, CanvasOverlay } from "@/builder/canvas/canvas";
import { StandaloneDocumentEditor } from "@/builder/provider";
import { IDocumentEditorState } from "@/builder/types";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { SideControl } from "@/scaffolds/sidecontrol";
import { useState } from "react";

export default function CanvasPlaygroundPage() {
  return <></>;
  // const [state, setState] = useState<IDocumentEditorState>({
  //   editable: true,
  //   document: {
  //     root_id: "",
  //     nodes: {},
  //   },
  // });

  // return (
  //   <StandaloneDocumentEditor
  //     state={state}
  //     // dispatch={}
  //   >
  //     <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto bg-transparent pointer-events-none">
  //       <CanvasOverlay />
  //       <AgentThemeProvider>{/* <StartPageEditor /> */}</AgentThemeProvider>
  //     </CanvasEventTarget>
  //     <aside className="hidden lg:flex h-full">
  //       <SideControl />
  //     </aside>
  //   </StandaloneDocumentEditor>
  // );
}
