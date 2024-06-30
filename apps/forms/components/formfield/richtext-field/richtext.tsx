"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import { useCreateBlockNote } from "@blocknote/react";
import {
  Block,
  BlockNoteSchema,
  defaultBlockSpecs,
  locales,
} from "@blocknote/core";
import { useEffect, useState } from "react";
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

// https://github.com/TypeCellOS/BlockNote/issues/881#issuecomment-2197197942
const { table: _noop1, ...remainingSpecs } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({
  blockSpecs: remainingSpecs,
});

export function RichTextEditorField({
  name,
  required,
  placeholder,
  initialContent,
  onContentChange,
  uploader,
  resolver,
}: {
  name: string;
  required?: boolean;
  placeholder?: string;
  initialContent?: Block[];
  onContentChange?: (content: Block[]) => void;
} & FileHandler) {
  const [txtjsonvalue, settxtjsonvalue] = useState<string | undefined>(
    undefined
  );

  const editor = useCreateBlockNote({
    schema: schema,
    // @ts-ignore
    initialContent: initialContent,
    // disableExtensions: [],
    dictionary: {
      ...locales.en,
      placeholders: {
        ...locales.en.placeholders,
        default: placeholder || locales.en.placeholders.default,
      },
    },
    // https://github.com/TypeCellOS/BlockNote/issues/884
    // trailingBlock: false,
    uploadFile: uploader
      ? async (file) => {
          const { path } = await uploader(file);
          // https://github.com/TypeCellOS/BlockNote/issues/886
          return RichTextStagedFileUtils.encodeTmpUrl(path!);
        }
      : undefined,
    resolveFileUrl: resolver
      ? async (url) => {
          const decoded = RichTextStagedFileUtils.decodeTmpUrl(url);
          switch (decoded.type) {
            case "url":
              return decoded.url;
            case "grida-tmp":
              const resolved = await resolver?.({
                path: decoded.path,
              });
              return resolved!.publicUrl;
          }
        }
      : undefined,
  });

  useEffect(() => {
    const fn = () => {
      const content = editor.document;
      try {
        settxtjsonvalue(JSON.stringify(content));
        onContentChange?.(content);
      } catch (e) {}
    };
    editor.onEditorContentChange(fn);
  }, [editor, onContentChange]);

  return (
    <div
      className="shadow-sm h-full w-full py-10 rounded-md border border-input bg-transparent text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => editor.focus()}
    >
      <ThemedRichTextEditorContent editor={editor}>
        <input
          type="text"
          name={name}
          value={txtjsonvalue}
          required={required}
          className="sr-only"
        />
      </ThemedRichTextEditorContent>
    </div>
  );
}
