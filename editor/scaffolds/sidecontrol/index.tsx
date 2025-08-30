"use client";

import React from "react";
import { SidebarRoot } from "@/components/sidebar";
import { useEditorState as useWorkbenchEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";
import { SrcUploaderProvider } from "./controls/src";
import { FontFamilyListProvider } from "./controls/font-family";
import { useDocumentAssetUpload } from "../asset";
import { SideControlDoctypeCanvas } from "./sidecontrol-doctype-canvas";
import { useCurrentEditor, useEditorState as useCanvasEditorState } from "@/grida-canvas-react";

export function SideControl() {
  const editor = useCurrentEditor();
  const fonts = useCanvasEditorState(editor, (state) => state.webfontlist.items);
  const [state] = useWorkbenchEditorState();
  const { doctype } = state;
  const { uploadPublic } = useDocumentAssetUpload();

  const srcUploader = (file: File) => {
    return uploadPublic(file).then((a) => ({ src: a.publicUrl }));
  };

  return (
    <SidebarRoot side="right">
      <FontFamilyListProvider fonts={fonts}>
        <SrcUploaderProvider uploader={srcUploader}>
          {doctype === "v0_form" && <SideControlDoctypeForm />}
          {doctype === "v0_site" && <SideControlDoctypeSite />}
          {doctype === "v0_canvas" && <SideControlDoctypeCanvas />}
        </SrcUploaderProvider>
      </FontFamilyListProvider>
    </SidebarRoot>
  );
}
