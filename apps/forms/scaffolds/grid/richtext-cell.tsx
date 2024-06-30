"use client";

import { ThemedRichTextEditorContent } from "@/components/richtext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect } from "react";

const { table: _noop1, ...remainingSpecs } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({
  blockSpecs: remainingSpecs,
});

function safevalue(value: any) {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }
  return undefined;
}

export function RichTextEditCell({
  defaultValue,
  onValueCommit,
}: {
  defaultValue?: any;
  onValueCommit?: (value: any) => void;
}) {
  const editor = useCreateBlockNote({
    schema: schema,
    initialContent: safevalue(defaultValue),
  });

  const onSaveClick = () => {
    const content = editor.document;
    onValueCommit?.(content);
  };

  return (
    <Dialog defaultOpen>
      <DialogContent className="min-w-full h-full max-w-lg flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Content</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1" onClick={() => editor.focus()}>
          <div className="prose dark:prose-invert mx-auto w-full">
            <ThemedRichTextEditorContent
              onKeyDown={(e) => {
                // this is required for preventing exit on enter pressed
                e.stopPropagation();
              }}
              editor={editor}
            />
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={onSaveClick}>Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
