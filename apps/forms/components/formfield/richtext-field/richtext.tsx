"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import { useCreateBlockNote } from "@blocknote/react";
import { locales } from "@blocknote/core";
import { useEffect, useState } from "react";

export function RichTextEditorField({
  name,
  required,
  placeholder,
}: {
  name: string;
  required?: boolean;
  placeholder?: string;
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
  });

  useEffect(() => {
    const fn = () => {
      settxtjsonvalue(JSON.stringify(editor.document));
    };
    editor.onEditorContentChange(fn);
  }, [editor]);

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
