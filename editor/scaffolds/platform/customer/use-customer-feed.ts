import { useEffect, useMemo } from "react";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import type { Data } from "@/lib/data";
import type { Customer } from "@/types";
import type { PostgrestError } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

export async function fetchCustomers(
  client: SupabaseClient<Database, "public">,
  project_id: number,
  query: Data.Relation.QueryState
) {
  return await client
    .from("customer")
    .select("*", { count: "estimated" })
    .order("last_seen_at", { ascending: false })
    .limit(query.q_page_limit)
    .eq("project_id", project_id);
}

// TODO: does not support realtime subscription
// TODO: does not fully support all queries
export function useCustomerFeed(
  project_id: number,
  {
    query = null,
    enabled = true,
  }: {
    query?: Data.Relation.QueryState | null | undefined;
    enabled?: boolean;
  },
  callbacks?: {
    onLoadingChange?: (loading: boolean) => void;
    onFeed?: (data: Customer[]) => void;
    onError?: (error: PostgrestError) => void;
  }
) {
  const client = useMemo(() => createClientWorkspaceClient(), []);

  useEffect(() => {
    if (!enabled) return;
    if (!query) return;

    callbacks?.onLoadingChange?.(true);
    fetchCustomers(client, project_id, query).then(({ data, error }) => {
      callbacks?.onLoadingChange?.(false);
      if (data) {
        callbacks?.onFeed?.(data);
      }
      if (error) {
        callbacks?.onError?.(error);
      }
    });
  }, [project_id, query, enabled, client]);
}
