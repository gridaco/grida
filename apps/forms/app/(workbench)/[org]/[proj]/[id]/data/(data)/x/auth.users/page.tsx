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
import { GridaXSupabase } from "@/types";
import { EditorApiResponse } from "@/types/private/api";
import { priority_sorter } from "@/utils/sort";
import { useEffect, useMemo } from "react";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import useSWR from "swr";

export default function XTablePage() {
  const [state, dispatch] = useEditorState();

  const {
    supabase_project,
    datagrid_rows_per_page,
    datagrid_orderby,
    datagrid_table_refresh_key,
    datagrid_isloading,
  } = state;

  const serachParams = useMemo(() => {
    return PrivateEditorApi.SupabaseQuery.makeQueryParams({
      limit: datagrid_rows_per_page,
      order: datagrid_orderby,
      refreshKey: datagrid_table_refresh_key,
    });
  }, [datagrid_rows_per_page, datagrid_orderby, datagrid_table_refresh_key]);

  const request = supabase_project
    ? PrivateEditorApi.XSupabase.url_x_auth_users_get(
        supabase_project.id,
        serachParams
      )
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
    GridaXSupabase.unknown_table_column_priorities
  );

  const columns = useMemo(
    () =>
      Object.keys(GridaXSupabase.SupabaseUserJsonSchema.properties)
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
      filter: state.datagrid_local_filter,
      table: EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
      data: {
        rows: data?.data?.users ?? [],
      },
    });
  }, [data, state.datagrid_local_filter]);

  return (
    <CurrentTable
      table={EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID}
    >
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
            masked={state.datagrid_local_filter.masking_enabled}
            tokens={
              state.datagrid_local_filter.localsearch
                ? [state.datagrid_local_filter.localsearch]
                : []
            }
            columns={columns}
            rows={filtered}
            loading={datagrid_isloading}
          />
        </GridLayout.Content>
        <GridLayout.Footer>
          <GridLimit />
          <GridCount count={filtered.length} keyword="user" />
          <GridRefresh />
        </GridLayout.Footer>
      </GridLayout.Root>
    </CurrentTable>
  );
}
