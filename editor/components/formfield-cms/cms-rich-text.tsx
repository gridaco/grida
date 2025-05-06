"use client";

import React, { useCallback } from "react";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";
import type { Content } from "@tiptap/react";
import { FileIO } from "@/lib/file";

export function CMSRichText({
  value,
  uploader,
  onValueChange,
  placeholder,
  autofocus = false,
  disabled = false,
}: {
  uploader?: FileIO.BucketFileUploaderFn;
  value: Content;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  disabled?: boolean;
}) {
  const _uploader = useCallback(
    async (file: File) => {
      const o = await uploader!(file);
      return o.publicUrl;
    },
    [uploader]
  );

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <MinimalTiptapEditor
        value={value}
        onChange={(content) => onValueChange?.(content as string)}
        className="w-full"
        editorContentClassName="p-5 w-full"
        output="html"
        placeholder={placeholder}
        shouldRerenderOnTransaction={false}
        immediatelyRender={false}
        autofocus={autofocus}
        editable={!disabled}
        uploader={uploader ? _uploader : undefined}
        editorClassName="focus:outline-none prose max-w-none"
      />
    </div>
  );
}
