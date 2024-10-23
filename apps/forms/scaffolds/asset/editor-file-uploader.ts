import { useCallback, useMemo } from "react";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";
import { v4 } from "uuid";
import * as k from "./k";
import { FileIO } from "@/lib/file";

function useStorageClient() {
  return useMemo(() => createClientWorkspaceClient().storage, []);
}

function useUpload(
  bucket: string,
  path: (file: File) => string | Promise<string>,
  onUpload?: (result: FileIO.GridaStorageUploadResult) => void
) {
  const storage = useStorageClient();

  return useCallback(
    async (file: File): Promise<FileIO.GridaStorageUploadResult> => {
      if (!file) throw new Error("No file provided");
      const _path = await path(file);
      if (!_path) throw new Error("No path provided");
      return await storage
        .from(bucket)
        .upload(_path, file, {
          contentType: file.type,
        })
        .then(({ data, error }) => {
          if (error) {
            throw new Error("Failed to upload file");
          }
          const publicUrl = storage.from(bucket).getPublicUrl(_path)
            .data.publicUrl;

          const result: FileIO.GridaStorageUploadResult = {
            object_id: data.id,
            bucket,
            path: data.path,
            fullPath: data.fullPath,
            publicUrl,
          };

          onUpload?.(result);
          return result;
        })
        .catch((e) => {
          console.error("upload error", e);
          throw e;
        });
    },
    [storage, bucket, path, onUpload]
  );
}

function useCreateAsset() {
  const [state] = useEditorState();
  const { document_id } = state;

  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  return useCallback(
    async ({ file, is_public }: { file: File; is_public: boolean }) => {
      const id = v4();

      return supabase
        .from("asset")
        .insert({
          id,
          is_public,
          document_id: document_id,
          name: file.name,
          type: file.type,
          size: file.size,
        })
        .select()
        .single();
    },
    [supabase, document_id]
  );
}

/**
 * upload file to document asset bucket
 *
 * id and file names are uuid generated - fire and forget
 */
export function useDocumentAssetUpload() {
  const supabase = useMemo(() => createClientWorkspaceClient(), []);
  const createAsset = useCreateAsset();

  const createAssetId = useCallback(
    async ({ file, public: is_public }: { file: File; public: boolean }) => {
      const { data, error } = await createAsset({ file, is_public });

      if (error) return;
      const { id } = data;
      return { id };
    },
    [createAsset]
  );

  const uploadPublic = useUpload(k.BUCKET_ASSETS_PUBLIC, async (file) => {
    const asset = await createAssetId({ file, public: true });
    return asset!.id;
  });

  const uploadPrivate = useUpload(k.BUCKET_ASSETS, async (file) => {
    const asset = await createAssetId({ file, public: false });
    return asset!.id;
  });

  return useMemo(
    () => ({ uploadPrivate, uploadPublic }),
    [uploadPrivate, uploadPublic]
  );
}

/**
 * @deprecated use useDocumentAssetUpload instead
 */
export function useGridaFormsPublicUpload() {
  const [state] = useEditorState();
  return useUpload(
    k.BUCKET_GRIDA_FORMS,
    () => `${state.form.form_id}/${nanoid()}`
  );
}

/**
 * public, temporary file uploader to playground bucket
 * for internal dev or public tmp playgrounds
 */
export function useDummyPublicUpload() {
  return useUpload(k.BUCKET_DUMMY, () => {
    return `public/${v4()}`;
  });
}
