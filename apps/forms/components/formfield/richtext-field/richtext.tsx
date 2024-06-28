"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import { useCreateBlockNote } from "@blocknote/react";
import { Block, locales } from "@blocknote/core";
import { useEffect, useState } from "react";
import type { FileResolverFn, FileUploaderFn } from "../file-upload-field";

type FileHandler =
  | {
      uploader?: FileUploaderFn;
      resolver?: FileResolverFn;
    }
  | {
      uploader: FileUploaderFn;
      resolver: FileResolverFn;
    };

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
    dictionary: {
      ...locales.en,
      placeholders: {
        ...locales.en.placeholders,
        default: placeholder || locales.en.placeholders.default,
      },
    },
    // https://github.com/TypeCellOS/BlockNote/issues/884
    // trailingBlock: false,
    initialContent: initialContent,
    // TODO:
    uploadFile: uploader
      ? async (file) => {
          const { path } = await uploader(file);
          // https://github.com/TypeCellOS/BlockNote/issues/886
          return "grida-tmp://" + path! + "?grida-tmp=true";
        }
      : undefined,
    resolveFileUrl: resolver
      ? async (url) => {
          if (url.startsWith("grida-tmp://")) {
            url = url.replace("grida-tmp://", "");
            url = url.replace("?grida-tmp=true", "");
            const resolved = await resolver?.({
              path: url,
            });
            return resolved!.publicUrl;
          } else {
            return url;
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
    <div className="shadow-sm h-full w-full py-10 rounded-md border border-input bg-transparent text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
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
