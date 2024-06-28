"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCreateBlockNote } from "@blocknote/react";

export function RichTextEditCell({ defaultValue }: { defaultValue?: any }) {
  const editor = useCreateBlockNote({
    initialContent: defaultValue,
  });

  return (
    <Dialog open>
      <DialogContent className="min-w-full h-full max-w-lg">
        <div className="prose dark:prose-invert mx-auto w-full">
          <ThemedRichTextEditorContent
            editable={false}
            onKeyDown={(e) => {
              // this is required for preventing exit on enter pressed
              e.stopPropagation();
            }}
            editor={editor}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
