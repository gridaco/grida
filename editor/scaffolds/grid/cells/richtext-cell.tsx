"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import type { Content } from "@tiptap/react";
import { MinimalTiptapEditor, toTiptapContent } from "@/kits/minimal-tiptap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-editor/dialog";
import { useDatabaseTableId } from "@/scaffolds/editor";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import { PrivateEditorApi } from "@/lib/private";
import { filemeta } from "@/utils/file";

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
  defaultValue?: unknown;
  onValueCommit?: (value: unknown) => void;
}) {
  const db_table_id = useDatabaseTableId();
  const uploader = useUploader({ db_table_id, field_id, row_id });

  const [value, setValue] = useState<Content | undefined>(() =>
    toTiptapContent(defaultValue)
  );

  const onSaveClick = useCallback(() => {
    onValueCommit?.(value);
  }, [onValueCommit, value]);

  const stopEnterPropagation = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // prevent grid exit on enter
      e.stopPropagation();
    },
    []
  );

  return (
    <Dialog defaultOpen>
      <DialogContent className="flex flex-col" fullScreen>
        <DialogHeader>
          <DialogTitle>Edit Content</DialogTitle>
        </DialogHeader>
        <div
          className="flex-1 min-h-0 flex flex-col"
          onKeyDown={stopEnterPropagation}
        >
          <MinimalTiptapEditor
            value={value}
            onChange={setValue}
            className="flex-1 min-h-0 w-full h-full rounded-none border-0 shadow-none"
            editorContentClassName="flex-1 min-h-0 w-full overflow-y-auto"
            output="json"
            placeholder="Write something…"
            immediatelyRender={false}
            uploader={uploader}
            editorClassName="focus:outline-none prose dark:prose-invert max-w-2xl mx-auto w-full py-10 px-5"
          />
        </div>
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
