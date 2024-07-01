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
import { EditorApiResponse, SignedUploadUrlData } from "@/types/private/api";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";

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
  field_id,
  defaultValue,
  onValueCommit,
}: {
  field_id: string;
  defaultValue?: any;
  onValueCommit?: (value: any) => void;
}) {
  const [state] = useEditorState();
  const uploader = async (file: File) => {
    const res = await fetch(
      // FIXME: invalid route
      `/private/editor/${state.form_id}/fields/${field_id}/file/upload/signed-url`,
      {
        method: "POST",
        body: JSON.stringify({
          // we need a dedicated cms storage api for this, for now, we are just randomly generating a path
          file: {
            name: file.name,
            size: file.size,
          },
        }),
      }
    );

    const { data, error } =
      (await res.json()) as EditorApiResponse<SignedUploadUrlData>;

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
