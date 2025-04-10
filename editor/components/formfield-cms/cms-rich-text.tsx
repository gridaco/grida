"use client";

import React from "react";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";
import type { Content } from "@tiptap/react";

export function CMSRichText({
  value,
  uploader,
  onValueChange,
  placeholder,
  autofocus,
  disabled,
}: {
  uploader?: (file: File) => Promise<string>;
  value: Content;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="w-full max-w-full">
      <MinimalTiptapEditor
        value={value}
        onChange={(content) => onValueChange?.(content as string)}
        className="w-full"
        editorContentClassName="p-5"
        output="html"
        placeholder={placeholder}
        shouldRerenderOnTransaction={false}
        immediatelyRender={false}
        autofocus={autofocus}
        editable={!disabled}
        uploader={uploader}
        editorClassName="focus:outline-none prose"
      />
    </div>
  );
}
