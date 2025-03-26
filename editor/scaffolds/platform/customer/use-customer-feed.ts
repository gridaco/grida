import { useEffect, useMemo, useState } from "react";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import type { Data } from "@/lib/data";
import type { PostgrestError } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { Platform } from "@/lib/platform";

export async function insertCustomer(
  client: SupabaseClient<Database, "public">,
  project_id: number,
  data: Partial<
    Pick<Platform.Customer.Customer, "name" | "email" | "phone" | "description">
  >
) {
  return await client
    .from("customer")
    .insert({
      project_id,
      ...data,
    })
    .select("*")
    .single();
}

export async function fetchCustomers(
  client: SupabaseClient<Database, "public">,
  project_id: number,
  query: Data.Relation.QueryState
) {
  // TODO: does not fully support all queries
  const { q_page_limit, q_page_index } = query;
  return await client
    .from("customer_with_tags")
    .select("*", { count: "estimated" })
    .order("last_seen_at", { ascending: false })
    .range(q_page_index * q_page_limit, (q_page_index + 1) * q_page_limit - 1)
    .eq("project_id", project_id);
}

export function useCustomers(
  project_id: number,
  query: Data.Relation.QueryState
) {
  const client = useMemo(() => createClientWorkspaceClient(), []);
  const [customers, setCustomers] = useState<
    Platform.Customer.CustomerWithTags[]
  >([]);

  useEffect(() => {
    fetchCustomers(client, project_id, query).then(({ data, error }) => {
      if (data) {
        setCustomers(data);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project_id, query.q_refresh_key]);

  return customers;

  //
}

// TODO: does not support realtime subscription
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
    onFeed?: (data: Platform.Customer.CustomerWithTags[]) => void;
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
