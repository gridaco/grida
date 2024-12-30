"use client";

import React from "react";
import { SidebarRoot } from "@/components/sidebar";
import { useEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";
import { SrcUploaderProvider } from "./controls/src";
import { FontFamilyListProvider } from "./controls/font-family";
import { useDocumentAssetUpload } from "../asset";
import { useGoogleFontsList } from "@/grida-react-canvas/google.fonts";

export function SideControl() {
  const fonts = useGoogleFontsList();
  const [state] = useEditorState();
  const { doctype } = state;
  const { uploadPublic } = useDocumentAssetUpload();

  const srcUploader = (file: File) => {
    return uploadPublic(file).then((a) => ({ src: a.publicUrl }));
  };

  return (
    <SidebarRoot side="right">
      <FontFamilyListProvider fonts={fonts}>
        <SrcUploaderProvider uploader={srcUploader}>
          <div className="h-5" />
          {doctype === "v0_form" && <SideControlDoctypeForm />}
          {doctype === "v0_site" && <SideControlDoctypeSite />}
        </SrcUploaderProvider>
      </FontFamilyListProvider>
    </SidebarRoot>
  );
}
