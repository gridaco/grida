import type { SupabaseClient } from "@supabase/supabase-js";

export namespace PublicUrls {
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase SDK generic params are not meaningful here
  export function organization_avatar_url(supabase: SupabaseClient<any, any>) {
    return (avatar_path: string) => {
      return avatar_path
        ? supabase.storage.from("avatars").getPublicUrl(avatar_path).data
            .publicUrl
        : null;
    };
  }
}
