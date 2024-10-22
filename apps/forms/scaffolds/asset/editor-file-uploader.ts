import { useCallback, useMemo } from "react";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";
import { v4 } from "uuid";
import * as k from "./k";
import assert from "assert";

export type UploadResult = {
  /**
   * supabase storage object id
   */
  object_id: string;
  bucket: string;
  path: string;
  fullPath: string;
  publicUrl: string;
};

// export type AssetUploadResult = UploadResult & {
//   /**
//    * asset id
//    */
//   id: string;
// };

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

function useUpload(
  bucket: string,
  path: () => string | Promise<string>,
  onUpload?: (result: UploadResult) => void
) {
  const storage = useStorageClient();
  const upload = useBucketUpload(bucket);

  return useCallback(
    async (file: Blob | File): Promise<UploadResult> => {
      if (!file) throw new Error("No file provided");
      const _path = await path();
      if (!_path) throw new Error("No path provided");
      return await upload(_path, file, {
        contentType: file.type,
      }).then(({ data, error }) => {
        if (error) {
          throw new Error("Failed to upload file");
        }
        const publicUrl = storage.from(bucket).getPublicUrl(_path)
          .data.publicUrl;

        const result: UploadResult = {
          object_id: data.id,
          bucket,
          path: data.path,
          fullPath: data.fullPath,
          publicUrl,
        };

        onUpload?.(result);
        return result;
      });
    },
    [storage, bucket, path, onUpload]
  );
}

function useCreateAsset() {
  const [state] = useEditorState();
  const { document_id } = state;

  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  const createAsset = useCallback(
    async (is_public: boolean) => {
      const id = v4();

      return supabase
        .from("asset")
        .insert({
          id,
          is_public,
          document_id: document_id,
        })
        .select()
        .single();
    },
    [supabase, document_id]
  );

  const resolveAssetObject = useCallback(
    (asset_id: string, object_id: string) => {
      return supabase
        .from("asset")
        .update({
          object_id: object_id,
        })
        .eq("id", asset_id);
    },
    [supabase]
  );

  return useMemo(
    () => ({ createAsset, resolveAssetObject }),
    [createAsset, resolveAssetObject]
  );
}

/**
 * upload file to document asset bucket
 *
 * id and file names are uuid generated - fire and forget
 */
export function useDocumentAssetUpload() {
  const { createAsset, resolveAssetObject } = useCreateAsset();

  const createAssetId = useCallback(
    async ({ public: isPublic }: { public: boolean }) => {
      assert(isPublic, "only public is supported atm.");
      const { data, error } = await createAsset(isPublic);

      if (error) return;
      const { id } = data;
      return { id };
    },
    [createAsset]
  );

  return useUpload(
    k.BUCKET_ASSETS,
    async () => {
      const asset = await createAssetId({ public: true });
      return asset!.id;
    },
    (result) => {
      // TODO:
      // set the object id to the asset id
      // result;
    }
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
