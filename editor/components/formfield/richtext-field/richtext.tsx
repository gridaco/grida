"use client";

import { useCallback, useState } from "react";
import type { Content } from "@tiptap/react";
import { MinimalTiptapEditor, toTiptapContent } from "@/kits/minimal-tiptap";
import type { FileResolverFn, FileUploaderFn } from "../file-upload-field";
import { RichTextStagedFileUtils } from "@/services/form";

type FileHandler =
  | {
      uploader?: FileUploaderFn;
      resolver?: FileResolverFn;
    }
  | {
      uploader: FileUploaderFn;
      resolver: FileResolverFn;
    };

const serialize = (content: Content): string =>
  typeof content === "string" ? content : JSON.stringify(content);

export function RichTextEditorField({
  name,
  required,
  placeholder,
  initialContent,
  onContentChange,
  uploader,
}: {
  name?: string;
  required?: boolean;
  placeholder?: string;
  initialContent?: unknown;
  onContentChange?: (serialized: string) => void;
} & FileHandler) {
  const [initialValue] = useState<Content | undefined>(() =>
    toTiptapContent(initialContent)
  );
  const [serialized, setSerialized] = useState<string>(() =>
    initialValue == null ? "" : serialize(initialValue)
  );

  const wrappedUploader = useCallback(
    async (file: File): Promise<string> => {
      const { path } = await uploader!(file);
      return RichTextStagedFileUtils.encodeTmpUrl(path!);
    },
    [uploader]
  );

  const handleChange = useCallback(
    (content: Content) => {
      const next = serialize(content);
      setSerialized(next);
      onContentChange?.(next);
    },
    [onContentChange]
  );

  return (
    <div className="shadow-sm h-full w-full rounded-md border border-input bg-transparent text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden">
      <MinimalTiptapEditor
        value={initialValue}
        onChange={handleChange}
        className="w-full border-0 shadow-none rounded-none"
        editorContentClassName="px-5 py-10 w-full"
        output="json"
        placeholder={placeholder}
        immediatelyRender={false}
        uploader={uploader ? wrappedUploader : undefined}
        editorClassName="focus:outline-none prose dark:prose-invert max-w-none min-h-[120px]"
      />
      <input
        type="text"
        name={name}
        value={serialized}
        required={required}
        className="sr-only"
        readOnly
      />
    </div>
  );
}
