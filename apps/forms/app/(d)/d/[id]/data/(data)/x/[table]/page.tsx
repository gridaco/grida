"use client";

import { PrivateEditorApi } from "@/lib/private";
import { useEditorState } from "@/scaffolds/editor";
import {
  GridContent,
  GridFooter,
  GridHeader,
  GridRoot,
} from "@/scaffolds/grid-editor/components/layout";
import { GridLimit } from "@/scaffolds/grid-editor/components/limit";
import { GridRefresh } from "@/scaffolds/grid-editor/components/refresh";
import { ReferenceTableGrid } from "@/scaffolds/grid/reference-grid";
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

  const { data } = useSWR<EditorApiResponse<{ users: any[] }, any>>(
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
    <GridRoot>
      <GridHeader>
        <h1 className="text-2xl font-bold">{table}</h1>
      </GridHeader>
      <GridContent>
        <ReferenceTableGrid
          columns={[{ key: "id", name: "id", type: "text" }]}
          // columns={[]}
          rows={data?.data?.users ?? []}
        />
      </GridContent>
      <GridFooter>
        <GridLimit />
        <GridRefresh />
      </GridFooter>
    </GridRoot>
  );
}
