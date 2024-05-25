import { useCallback } from "react";
import { createClientFormsClient } from "@/lib/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";

function useStorageUploader(bucket: string, makefilekey: () => string) {
  const supabase = createClientFormsClient();

  return useCallback(
    async (file: Blob | File) => {
      const fileKey = makefilekey();
      return await supabase.storage
        .from(bucket)
        .upload(fileKey, file, {
          contentType: file.type,
        })
        .then(({ data, error }) => {
          if (error) {
            throw new Error("Failed to upload file");
          }
          return supabase.storage.from(bucket).getPublicUrl(fileKey).data
            .publicUrl;
        });
    },
    [supabase.storage, bucket, makefilekey]
  );
}

export function useFormMediaUploader() {
  const [state] = useEditorState();

  return useStorageUploader("grida-forms", () => {
    return `${state.form_id}/${nanoid()}`;
  });
}

export function useFormPlaygroundMediaUploader() {
  return useStorageUploader("grida-forms-playground", () => {
    return `public/${nanoid()}`;
  });
}
