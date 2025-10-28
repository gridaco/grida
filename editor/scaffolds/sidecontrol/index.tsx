"use client";

import React from "react";
import { SidebarRoot } from "@/components/sidebar";
import { useEditorState as useWorkbenchEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";
import { SrcUploaderProvider } from "./controls/src";
import { useDocumentAssetUpload } from "../asset";
import { SideControlDoctypeCanvas } from "./sidecontrol-doctype-canvas";

export function SideControl() {
  const [state] = useWorkbenchEditorState();
  const { doctype } = state;
  const { uploadPublic } = useDocumentAssetUpload();

  const srcUploader = (file: File) => {
    return uploadPublic(file).then((a) => ({ src: a.publicUrl }));
  };

  return (
    <SidebarRoot side="right">
      <SrcUploaderProvider uploader={srcUploader}>
        {doctype === "v0_form" && <SideControlDoctypeForm />}
        {doctype === "v0_site" && <SideControlDoctypeSite />}
        {doctype === "v0_canvas" && <SideControlDoctypeCanvas />}
      </SrcUploaderProvider>
    </SidebarRoot>
  );
}
