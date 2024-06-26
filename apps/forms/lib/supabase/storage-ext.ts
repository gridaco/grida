import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileObject } from "@supabase/storage-js";

export namespace SupabaseStorageExtensions {
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
    let files: Record<string, FileObject> = {};
    let stack: string[] = [path];

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
}
