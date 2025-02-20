import useSWR from "swr";
import { PrivateEditorApi } from "@/lib/private";
import { GridaXSupabase } from "@/types";

export function useXSBListUsers(
  supabase_project_id: number,
  q?: {
    page?: number;
    perPage?: number;
    // refresh key
    r?: number | string;
  }
) {
  return useSWR<GridaXSupabase.ListUsersResult>(
    PrivateEditorApi.XSupabase.url_x_auth_users_get(supabase_project_id, q),
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );
}
