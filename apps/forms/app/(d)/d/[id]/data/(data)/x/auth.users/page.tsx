"use client";

import { PrivateEditorApi } from "@/lib/private";
import { useEditorState } from "@/scaffolds/editor";
import {
  GridLimit,
  GridViewSettings,
  GridRefresh,
  GridLocalSearch,
  GridCount,
  TableViews,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { ReferenceTableGrid } from "@/scaffolds/grid/reference-grid";
import { GridaSupabase } from "@/types";
import { EditorApiResponse } from "@/types/private/api";
import { priority_sorter } from "@/utils/sort";
import { useEffect, useMemo } from "react";
import { MainTable } from "@/scaffolds/editor/utils/main-table";
import useSWR from "swr";
import { GridData } from "@/scaffolds/grid-editor/grid-data";

export default function XTablePage() {
  const [state, dispatch] = useEditorState();

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
    ? `/private/editor/connect/${state.form_id}/supabase/table/auth.users/query?${serachParams}`
    : null;

  const { data, isLoading, isValidating } = useSWR<
    EditorApiResponse<{ users: any[] }, any>
  >(
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

  useEffect(() => {
    dispatch({
      type: "editor/data-grid/loading",
      isloading: isLoading || isValidating,
    });
  }, [dispatch, isLoading, isValidating]);

  const sort_by_priorities = priority_sorter(
    GridaSupabase.unknown_table_column_priorities
  );

  const columns = useMemo(
    () =>
      Object.keys(GridaSupabase.SupabaseUserJsonSchema.properties)
        .sort(sort_by_priorities)
        .map((key) => {
          return {
            key: key,
            name: key,
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      filter: state.datagrid_filter,
      table: "x-supabase-auth.users",
      data: {
        rows: data?.data?.users ?? [],
      },
    });
  }, [data, state.datagrid_filter]);

  return (
    <MainTable table="x-supabase-auth.users">
      <GridLayout.Root>
        <GridLayout.Header>
          <GridLayout.HeaderMenus>
            <TableViews />
            <GridLocalSearch />
          </GridLayout.HeaderMenus>
          <GridLayout.HeaderMenus>
            <GridViewSettings />
          </GridLayout.HeaderMenus>
        </GridLayout.Header>
        <GridLayout.Content>
          <ReferenceTableGrid
            masked={state.datagrid_filter.masking_enabled}
            tokens={
              state.datagrid_filter.localsearch
                ? [state.datagrid_filter.localsearch]
                : []
            }
            columns={columns}
            rows={filtered}
            loading={inputlength === 0}
          />
        </GridLayout.Content>
        <GridLayout.Footer>
          <GridLimit />
          <GridCount count={filtered.length} />
          <GridRefresh />
        </GridLayout.Footer>
      </GridLayout.Root>
    </MainTable>
  );
}
