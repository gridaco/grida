"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import suggestion from "./suggestion";

export function TemplateTextEditor({
  id,
  defaultValue,
  onValueChange,
}: {
  id?: string;
  defaultValue?: string;
  onValueChange?: (html: string) => void;
}) {
  const editor = useEditor({
    autofocus: true,
    extensions: [
      StarterKit.configure({
        heading: undefined,
      }),
      // Mention.configure({
      //   HTMLAttributes: {
      //     class: "mention",
      //   },
      //   suggestion,
      // }),
    ],
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert p-1 focus:outline-none",
      },
    },
    content: defaultValue,
    onUpdate: ({ editor }) => {
      onValueChange?.(editor.getHTML());
    },
  });

  return <EditorContent id={id} className="h-full w-full" editor={editor} />;
}
