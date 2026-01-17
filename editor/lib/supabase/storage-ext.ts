import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileObject, TransformOptions } from "@supabase/storage-js";

export namespace SupabaseStorageExtensions {
  /**
   *
   * Converts the givven public url to a transformed url.
   *
   * https://xxx.supabase.co/storage/v1/object/public/[bucket]/[...folder]/[file.png]
   * https://xxx.supabase.co/storage/v1/render/image/public/[bucket]/[...folder]/[file.png]?width=900&quality=20&resize=contain
   * @param publicUrl
   * @param transform
   * @returns transformed url https:.../storage/v1/render/image/public/...
   */
  export function transformPublicUrl(
    publicUrl: string,
    transform: TransformOptions
  ): string {
    const baseUrl = publicUrl.replace(
      "/object/public/",
      "/render/image/public/"
    );

    const params = new URLSearchParams();

    if (transform.width) params.append("width", transform.width.toString());
    if (transform.height) params.append("height", transform.height.toString());
    if (transform.resize) params.append("resize", transform.resize);
    if (transform.quality)
      params.append("quality", transform.quality.toString());
    if (transform.format) params.append("format", transform.format);

    return `${baseUrl}?${params.toString()}`;
  }

  type StorageClient = SupabaseClient["storage"];

  async function list(storage: StorageClient, bucket: string, path: string) {
    const { data, error } = await storage.from(bucket).list(path);

    if (error) {
      throw error;
    }

    return data;
  }

  export async function tree(
    storage: StorageClient,
    bucket: string,
    path = ""
  ) {
    const files: Record<string, FileObject> = {};
    const stack: string[] = [path];

    while (stack.length > 0) {
      const currentPath = stack.pop();
      const items = await list(storage, bucket, currentPath!);

      const promises = items.map(async (item) => {
        const itemPath = currentPath + "/" + item.name;
        const isfile = !!item.id;
        if (isfile) {
          files[itemPath] = item;
        } else {
          stack.push(itemPath);
        }
      });

      await Promise.all(promises);
    }

    return files;
  }

  export async function rmdir(
    storage: StorageClient,
    bucket: string,
    path: string
  ) {
    const files = await tree(storage, bucket, path);
    const paths = Object.keys(files);
    const { data, error } = await storage.from(bucket).remove(paths);

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * @see https://github.com/supabase/storage/issues/266#issuecomment-2191254105
   */
  export async function exists(
    storage: StorageClient,
    bucket: string,
    path: string
  ) {
    const { data, error } = await storage.from(bucket).list(path);

    if (error) {
      throw error;
    }

    return data.some((file) => file.name === path.split("/").pop());
  }

  export async function uploadToSupabaseS3SignedUrl(
    signed_url: string,
    file: File
  ): Promise<{
    data: {
      fullPath: string;
      path: string;
    } | null;
    error: unknown;
  }> {
    try {
      const response = await fetch(signed_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (response.ok) {
        const uploaded = await response.json();

        // the key returns full path starting from bucket name. (but without host)
        // e.g. "grida-forms-response/tmp/46451287-7f6d-464d-9f6c-745884a79de8/e5fd589a-6b27-45c9-9224-31a1d31e8a2a/1719589606743/image.png"
        const { Key } = uploaded;

        return {
          data: {
            path: Key.split("/").slice(1).join("/"),
            fullPath: Key,
          },
          error: null,
        };
      } else {
        return { data: null, error: response.statusText };
      }
    } catch (error) {
      return {
        data: null,
        error,
      };
    }
  }
}
