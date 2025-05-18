import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Data } from "@/lib/data";
import { Platform } from "@/lib/platform";
import type { PostgrestError } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@app/database";

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

export async function deleteCustomers(
  client: SupabaseClient<Database, "public">,
  project_id: number,
  ids: string[]
) {
  const { count, error } = await client
    .from("customer")
    .delete({ count: "exact" })
    .eq("project_id", project_id)
    .in("uid", ids);

  if (error) throw error;
  if (count !== ids.length) throw new Error("failed");
  return count;
}

export async function fetchCustomers(
  client: SupabaseClient<Database, "public">,
  project_id: number,
  query: Data.Relation.QueryState
) {
  const { q_page_limit, q_page_index, q_orderby, q_predicates, q_text_search } =
    query;
  const q = client
    .from("customer_with_tags")
    .select("*", { count: "estimated" })
    .range(q_page_index * q_page_limit, (q_page_index + 1) * q_page_limit - 1)
    .eq("project_id", project_id);

  if (Object.keys(q_orderby).length > 0) {
    // orderby
    Object.entries(q_orderby).forEach(([key, orderby]) => {
      q.order(key, orderby);
    });
  } else {
    // fallback orderby
    q.order("uid", { ascending: false });
  }

  // predicates
  const valid_predicates = q_predicates
    ?.map(Data.Query.Predicate.Extension.encode)
    ?.filter(Data.Query.Predicate.is_predicate_fulfilled);
  valid_predicates.forEach((predicate) => {
    q.filter(predicate.column, predicate.op, predicate.value);
  });

  // text search (filter)
  if (q_text_search && q_text_search.query) {
    q.filter(
      Platform.Customer.TABLE_SEARCH_TEXT,
      "ilike",
      `%${q_text_search.query}%`
    );
  }

  return await q;
}

export function useCustomers(
  project_id: number,
  query: Data.Relation.QueryState
) {
  const client = useMemo(() => createBrowserClient(), []);
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
  const client = useMemo(() => createBrowserClient(), []);

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
