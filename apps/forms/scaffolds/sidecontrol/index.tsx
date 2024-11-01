"use client";

import React from "react";
import { SidebarRoot } from "@/components/sidebar";
import { useEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";
import { SrcUploaderProvider } from "./controls/src";
import { useDocumentAssetUpload } from "../asset";

export function SideControl() {
  const [state] = useEditorState();
  const { doctype } = state;
  const { uploadPublic } = useDocumentAssetUpload();

  const srcUploader = (file: File) => {
    return uploadPublic(file).then((a) => ({ src: a.publicUrl }));
  };

  return (
    <SidebarRoot side="right">
      <SrcUploaderProvider uploader={srcUploader}>
        <div className="h-5" />
        {doctype === "v0_form" && <SideControlDoctypeForm />}
        {doctype === "v0_site" && <SideControlDoctypeSite />}
      </SrcUploaderProvider>
    </SidebarRoot>
  );
}
