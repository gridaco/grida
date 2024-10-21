import { useCallback, useMemo } from "react";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";
import { v4 } from "uuid";
import * as k from "./k";
import assert from "assert";

function useStorageClient() {
  return useMemo(() => createClientWorkspaceClient().storage, []);
}

/**
 *
 * @param bucket bucket name
 * @returns upload function
 * @example
 * const upload = useBucketUpload("bucket-name");
 * upload("path/to/file", file, { contentType: file.type });
 */
function useBucketUpload(bucket: string) {
  const storage = useStorageClient();

  return useMemo(() => storage.from(bucket).upload, [storage, bucket]);
}

function useUpload(bucket: string, path: () => string | Promise<string>) {
  const storage = useStorageClient();
  const upload = useBucketUpload(bucket);

  return useCallback(
    async (file: Blob | File) => {
      if (!file) throw new Error("No file provided");
      const _path = await path();
      if (!_path) throw new Error("No path provided");
      return await upload(_path, file, {
        contentType: file.type,
      }).then(({ data, error }) => {
        if (error) {
          throw new Error("Failed to upload file");
        }
        return storage.from(bucket).getPublicUrl(_path).data.publicUrl;
      });
    },
    [storage, bucket, path]
  );
}

function useCreateAsset() {
  const [state] = useEditorState();
  const { document_id } = state;

  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  const createAsset = useCallback(async () => {
    const id = v4();

    return supabase
      .from("asset")
      .insert({
        id,
        document_id: document_id,
      })
      .select()
      .single();
  }, [supabase, document_id]);

  return useCallback(
    async ({ public: isPublic }: { public: boolean }) => {
      assert(isPublic, "only public is supported atm.");
      const { data, error } = await createAsset();

      if (error) return;
      const { id } = data;
      const name = isPublic ? "public/" + id : id;
      return { id, name };
    },
    [createAsset]
  );
}

/**
 * upload file to document asset bucket
 *
 * id and file names are uuid generated - fire and forget
 */
export function useDocumentAssetUpload() {
  const createAsset = useCreateAsset();

  return useUpload(k.BUCKET_ASSETS, async () => {
    const asset = await createAsset({ public: true });
    return asset!.name;
  });
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
