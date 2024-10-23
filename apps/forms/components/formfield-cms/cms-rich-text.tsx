"use client";

import React, { useCallback, useEffect } from "react";
import { Block, BlockNoteEditor } from "@blocknote/core";
import { useDocumentAssetUpload } from "@/scaffolds/asset";
import { useCreateBlockNote } from "@blocknote/react";
import {
  RichTextContent,
  safeInitialContent,
  schema,
} from "@/components/richtext";

export function CMSRichText({
  defaultValue,
  onContentChange,
}: {
  defaultValue: any;
  onContentChange: (editor: BlockNoteEditor<any>, content: Block[]) => void;
}) {
  const { uploadPublic } = useDocumentAssetUpload();

  const uploadFile = useCallback(
    (file: File) => {
      return uploadPublic(file).then((r) => r.publicUrl);
    },
    [uploadPublic]
  );

  const editor = useCreateBlockNote({
    schema: schema,
    initialContent: safeInitialContent(defaultValue),
    uploadFile: uploadFile,
    animations: false,
  });

  useEffect(() => {
    const fn = () => {
      const content = editor.document;
      try {
        onContentChange?.(editor, content);
      } catch (e) {}
    };
    editor.onEditorContentChange(fn);
  }, [editor, onContentChange]);

  return <RichTextContent editor={editor} />;
}
