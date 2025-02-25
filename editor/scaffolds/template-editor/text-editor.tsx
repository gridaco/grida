"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import suggestion from "./suggestion";
import { useEffect } from "react";

export function TemplateTextEditor({
  id,
  value,
  refreshKey,
  plaintext,
  autofocus,
  onValueChange,
}: {
  id?: string;
  value?: string;
  refreshKey?: string;
  plaintext?: boolean;
  autofocus?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const editor = useEditor({
    autofocus: autofocus,
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
    content: value,
    onUpdate: ({ editor }) => {
      if (plaintext) {
        onValueChange?.(editor.getText());
      } else {
        onValueChange?.(editor.getHTML());
      }
    },
  });

  useEffect(() => {
    if (refreshKey) editor?.commands.setContent(value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return <EditorContent id={id} className="h-full w-full" editor={editor} />;
}
