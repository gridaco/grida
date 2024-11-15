"use client";

import {
  RichTextContent,
  schema,
  safeInitialContent,
} from "@/components/richtext";
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
import { useCreateBlockNote } from "@blocknote/react";
import { useDatabaseTableId } from "@/scaffolds/editor";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import { PrivateEditorApi } from "@/lib/private";
import { filemeta } from "@/utils/file";
import { useCallback } from "react";

function useUploader({
  db_table_id,
  field_id,
  row_id,
}: {
  db_table_id: string | null;
  field_id: string;
  row_id: string;
}) {
  const uploader = useCallback(
    async (file: File) => {
      if (!db_table_id) {
        throw new Error("db_table_id is not set");
      }
      const createsignedres =
        await PrivateEditorApi.Files.createSignedUploadUrl({
          form_id: db_table_id,
          field_id: field_id,
          row_id: row_id,
          file: filemeta(file),
        });

      const { data, error } = createsignedres.data;

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

      const path = uploaded.data.path;

      const publicurlres = await PrivateEditorApi.FormFieldFile.getPublicUrl({
        field_id: field_id,
        form_id: db_table_id,
        filepath: path,
      });

      if (publicurlres.data.error || !publicurlres.data.data) {
        throw publicurlres.data.error;
      }

      return publicurlres.data.data.publicUrl;
    },
    [db_table_id, field_id, row_id]
  );

  return uploader;
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
  const db_table_id = useDatabaseTableId();
  const uploader = useUploader({ db_table_id, field_id, row_id });

  const editor = useCreateBlockNote({
    schema: schema,
    initialContent: safeInitialContent(defaultValue),
    uploadFile: uploader,
    animations: false,
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
            <RichTextContent
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
