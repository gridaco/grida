import type { SupabaseClient } from "@supabase/supabase-js";

export class FileStorage {
  constructor(
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase SDK generic params
    readonly client: SupabaseClient<any, any>,
    readonly bucket: string
  ) {
    //
  }

  createSignedUploadUrl(path: string, options?: { upsert: boolean }) {
    return (
      this.client.storage
        .from(this.bucket)
        // valid for 2 hours - https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
        .createSignedUploadUrl(path, options)
    );
  }

  getPublicUrl(path: string) {
    return this.client.storage.from(this.bucket).getPublicUrl(path);
  }
}
