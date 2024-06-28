"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect } from "react";

export function RichTextEditCell({ defaultValue }: { defaultValue?: any }) {
  const editor = useCreateBlockNote({
    initialContent: defaultValue,
  });

  return (
    <Dialog open>
      <DialogContent className="min-w-full h-full max-w-lg">
        <ThemedRichTextEditorContent
          onKeyDown={(e) => {
            // this is required for preventing exit on enter pressed
            e.stopPropagation();
          }}
          editor={editor}
        />
      </DialogContent>
    </Dialog>
  );
}
