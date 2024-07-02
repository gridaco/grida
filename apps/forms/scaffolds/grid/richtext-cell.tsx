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
import { useEditorState } from "../editor";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import { PrivateEditorApi } from "@/lib/private";
import { filemeta } from "@/utils/file";

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
  row_id,
  field_id,
  defaultValue,
  onValueCommit,
}: {
  row_id: string;
  field_id: string;
  defaultValue?: any;
  onValueCommit?: (value: any) => void;
}) {
  const [state] = useEditorState();
  const uploader = async (file: File) => {
    const res = await PrivateEditorApi.Files.createSignedUploadUrl({
      form_id: state.form_id,
      field_id: field_id,
      row_id: row_id,
      file: filemeta(file),
    });

    const { data, error } = res.data;

    if (error || !data) {
      throw error;
    }

    const uploaded =
      await SupabaseStorageExtensions.uploadToSupabaseS3SignedUrl(
        data.signedUrl,
        file
      );

    if (uploaded.error || !uploaded.data) {
      throw uploaded.error;
    }

    // TODO: we need a public url.
    return uploaded.data.path;
  };

  const editor = useCreateBlockNote({
    schema: schema,
    initialContent: safevalue(defaultValue),
    uploadFile: uploader,
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
