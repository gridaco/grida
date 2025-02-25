import { Data } from "@/lib/data";
import { PrivateEditorApi } from "@/lib/private";
import { XPostgrestQuery } from "@/lib/supabase-postgrest/builder";
import type { GridaXSupabase } from "@/types";
import { useMemo } from "react";
import useSWR, { type BareFetcher } from "swr";

/**
 * swr fetcher for x-sb search integration, which passes schema name to Accept-Profile header
 * @returns
 */
const x_table_search_swr_fetcher = async (
  arg: [string, string]
): Promise<GridaXSupabase.XSBSearchResult> => {
  const [url, schema_name] = arg;
  const res = await fetch(url, {
    headers: {
      "Accept-Profile": schema_name,
    },
  });
  return res.json();
};

export function useXSBTableSearch({
  supabase_project_id,
  supabase_schema_name,
  supabase_table_name,
  q,
}: {
  supabase_project_id: number;
  supabase_table_name: string;
  supabase_schema_name: string;
  q?: URLSearchParams | string | Partial<Data.Relation.QueryState>;
}) {
  //

  const searchParams = useMemo(() => {
    if (!q) return;

    if (q instanceof URLSearchParams) {
      return q;
    }
    if (typeof q === "string") {
      return q;
    }

    return XPostgrestQuery.QS.fromQueryState(q);
  }, [q]);

  return useSWR<GridaXSupabase.XSBSearchResult>(
    [
      PrivateEditorApi.XSupabase.url_x_table_search(
        supabase_project_id,
        supabase_table_name,
        {
          serachParams: searchParams,
        }
      ),
      supabase_schema_name,
    ],
    // @see https://github.com/vercel/swr/discussions/545#discussioncomment-10740463
    x_table_search_swr_fetcher as BareFetcher<any>
  );
}
