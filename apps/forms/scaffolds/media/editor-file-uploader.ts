import { createClientComponentFormsClient } from "@/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";
import { useCallback } from "react";

export function useUploadFile() {
  const [state] = useEditorState();
  const supabase = createClientComponentFormsClient();

  return useCallback(
    async (file: Blob | File) => {
      if (!file) throw new Error("No file provided");
      const fileKey = `${state.form.form_id}/${nanoid()}`;
      return await supabase.storage
        .from("grida-forms")
        .upload(fileKey, file, {
          contentType: file.type,
        })
        .then(({ data, error }) => {
          if (error) {
            throw new Error("Failed to upload file");
          }
          return supabase.storage.from("grida-forms").getPublicUrl(fileKey).data
            .publicUrl;
        });
    },
    [supabase.storage, state.form.form_id]
  );
}
