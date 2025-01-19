"use client";

import React from "react";
import { SidebarRoot, SidebarSection } from "@/components/sidebar";
import { useEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";
import { SrcUploaderProvider } from "./controls/src";
import { FontFamilyListProvider } from "./controls/font-family";
import { useDocumentAssetUpload } from "../asset";
import { useGoogleFontsList } from "@/grida-fonts/react/hooks";
import { Align, Selection, Zoom } from "./sidecontrol-node-selection";

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
          {doctype === "v0_canvas" && (
            <>
              <SidebarSection className="mb-4 px-2 flex justify-end">
                <Zoom />
              </SidebarSection>
              <Align />
              <hr />
              <Selection />
            </>
          )}
        </SrcUploaderProvider>
      </FontFamilyListProvider>
    </SidebarRoot>
  );
}
