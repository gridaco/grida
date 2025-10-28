"use client";

import React from "react";
import { Selection, Zoom } from "./sidecontrol-node-selection";
import { SidebarSection } from "@/components/sidebar";
import { DocumentProperties } from "./sidecontrol-document-properties";
import { FontFamilyListProvider } from "./controls/font-family";
import {
  useCurrentEditor,
  useEditorState as useCanvasEditorState,
} from "@/grida-canvas-react";

export function SideControlDoctypeCanvas() {
  const editor = useCurrentEditor();
  const fonts = useCanvasEditorState(
    editor,
    (state) => state.webfontlist.items
  );

  return (
    <>
      <FontFamilyListProvider fonts={fonts}>
        <SidebarSection className="mb-4 px-2 flex justify-end">
          <Zoom />
        </SidebarSection>
        <hr />
        <Selection
          empty={
            <div className="mt-4 mb-10">
              <DocumentProperties />
            </div>
          }
        />
      </FontFamilyListProvider>
    </>
  );
}
