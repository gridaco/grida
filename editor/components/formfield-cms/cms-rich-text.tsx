"use client";

import React, { useCallback } from "react";
import { useDocumentAssetUpload } from "@/scaffolds/asset";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";
import type { Content } from "@tiptap/react";

export function CMSRichText({
  value,
  onValueChange,
  placeholder,
  autofocus,
  disabled,
}: {
  value: Content;
  onValueChange?: (value: Content) => void;
  placeholder?: string;
  autofocus?: boolean;
  disabled?: boolean;
}) {
  const { uploadPublic } = useDocumentAssetUpload();

  const uploadFile = useCallback(
    (file: File) => {
      return uploadPublic(file).then((r) => r.publicUrl);
    },
    [uploadPublic]
  );

  return (
    <div className="w-full max-w-full">
      <MinimalTiptapEditor
        value={value}
        onChange={onValueChange}
        className="w-full"
        editorContentClassName="p-5"
        output="html"
        placeholder={placeholder}
        shouldRerenderOnTransaction={false}
        immediatelyRender={false}
        autofocus={autofocus}
        editable={!disabled}
        uploader={uploadFile}
        editorClassName="focus:outline-none prose"
      />
    </div>
  );
}
