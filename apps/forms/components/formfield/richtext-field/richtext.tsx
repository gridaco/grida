"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import { useCreateBlockNote } from "@blocknote/react";
import { Block, locales } from "@blocknote/core";
import { useEffect, useState } from "react";

export function RichTextEditorField({
  name,
  required,
  placeholder,
  initialContent,
  onContentChange,
}: {
  name: string;
  required?: boolean;
  placeholder?: string;
  initialContent?: Block[];
  onContentChange?: (content: Block[]) => void;
}) {
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
    trailingBlock: false,
    initialContent: initialContent,
    // TODO:
    // uploadFile: async (file) => file,
    // resolveFileUrl: async (url) => url,
  });

  useEffect(() => {
    const fn = () => {
      const content = editor.document;
      settxtjsonvalue(JSON.stringify(content));
      onContentChange?.(content);
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
