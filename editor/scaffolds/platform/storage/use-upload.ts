"use client";

import { FileIO } from "@/lib/file";
import { createBrowserClient } from "@/lib/supabase/client";
import { useCallback, useMemo } from "react";

export function useStorageClient() {
  return useMemo(() => createBrowserClient().storage, []);
}

export function useUpload(
  bucket: string,
  path: string | ((file: File) => string | Promise<string>)
) {
  const storage = useStorageClient();

  return useCallback(
    async (file: File): Promise<FileIO.UploadResult> => {
      if (!file) throw new Error("No file provided");
      const _path = typeof path === "function" ? await path(file) : path;
      if (!_path) throw new Error("No path provided");
      return await storage
        .from(bucket)
        .upload(_path, file, {
          contentType: file.type,
        })
        .then(({ data, error }) => {
          if (error) {
            console.error("upload error", error);
            throw new Error("Failed to upload file");
          }
          const publicUrl = storage.from(bucket).getPublicUrl(_path)
            .data.publicUrl;

          const result = {
            object_id: data.id,
            bucket,
            path: data.path,
            fullPath: data.fullPath,
            publicUrl,
          } satisfies FileIO.UploadResult;

          return result;
        })
        .catch((e) => {
          console.error("upload error", e);
          throw e;
        });
    },
    [storage, bucket, path]
  );
}
