"use client";

import { PrivateEditorApi } from "@/lib/private";
import { useEditorState } from "@/scaffolds/editor";
import { GridaSupabase } from "@/types";
import { EditorApiResponse } from "@/types/private/api";
import assert from "assert";
import { useMemo } from "react";
import useSWR from "swr";

export default function XTablePage({
  params,
}: {
  params: {
    table: string;
  };
}) {
  const { table } = params;

  const [state] = useEditorState();

  // only supports auth.users atm.
  assert(table === "auth.users", `Unsupported table "${table}"`);

  const {
    form_id,
    datagrid_rows_per_page,
    datagrid_orderby,
    datagrid_table_refresh_key,
  } = state;

  const serachParams = useMemo(() => {
    return PrivateEditorApi.SupabaseQuery.makeQueryParams({
      limit: datagrid_rows_per_page,
      order: datagrid_orderby,
      refreshKey: datagrid_table_refresh_key,
    });
  }, [datagrid_rows_per_page, datagrid_orderby, datagrid_table_refresh_key]);

  const request = state.connections.supabase?.main_supabase_table_id
    ? `/private/editor/connect/${state.form_id}/supabase/table/${table}/query?${serachParams}`
    : null;

  const res = useSWR<EditorApiResponse<GridaSupabase.XDataRow[], any>>(
    request,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      // disable this since this feed replaces (not updates) the data, which causes the ui to refresh, causing certain ux fails (e.g. dialog on cell)
      revalidateOnFocus: false,
    }
  );

  return (
    <main>
      <h1 className="text-2xl font-bold">{table}</h1>
      <pre>{JSON.stringify(res.data, null, 2)}</pre>
    </main>
  );
}
