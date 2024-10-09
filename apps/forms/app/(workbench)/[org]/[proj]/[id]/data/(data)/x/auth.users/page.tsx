"use client";

import { PrivateEditorApi } from "@/lib/private";
import { useEditorState } from "@/scaffolds/editor";
import {
  GridQueryLimitSelect,
  GridViewSettings,
  GridRefreshButton,
  DataQueryTextSearch,
  GridQueryCount,
  TableViews,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { EditorApiResponse } from "@/types/private/api";
import { useEffect, useMemo } from "react";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import { XPostgrestQuery } from "@/lib/supabase-postgrest/builder";
import useSWR from "swr";
import {
  useDataGridTextSearch,
  useDataGridQuery,
  useDataGridRefresh,
} from "@/scaffolds/editor/use";
import { XSBAuthUsersGrid } from "@/scaffolds/grid/wellknown/xsb-auth.users-grid";
import { XSBUserRow } from "@/scaffolds/grid";

export default function XTablePage() {
  const [state, dispatch] = useEditorState();

  const { supabase_project, datagrid_isloading, datagrid_query } = state;

  const refresh = useDataGridRefresh();
  const query = useDataGridQuery();
  const search = useDataGridTextSearch();

  const serachParams = useMemo(() => {
    if (!datagrid_query) return;
    const search = XPostgrestQuery.QS.select({
      limit: datagrid_query?.q_page_limit,
      order: datagrid_query?.q_orderby,
      // cannot apply filter to auth.users
      filters: undefined,
    });
    search.set("r", datagrid_query?.q_refresh_key?.toString());
    return search;
  }, [datagrid_query]);

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

  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      filter: {
        empty_data_hidden: state.datagrid_local_filter.empty_data_hidden,
        text_search: state.datagrid_query?.q_text_search,
      },
      table: EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
      data: {
        rows: data?.data?.users ?? [],
      },
    });
  }, [data, state.datagrid_local_filter, state.datagrid_query?.q_text_search]);

  return (
    <CurrentTable
      table={EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID}
    >
      <GridLayout.Root>
        <GridLayout.Header>
          <GridLayout.HeaderLine>
            <GridLayout.HeaderMenus>
              <TableViews />
              <DataQueryTextSearch onValueChange={search} />
            </GridLayout.HeaderMenus>
            <GridLayout.HeaderMenus>
              <GridViewSettings />
            </GridLayout.HeaderMenus>
          </GridLayout.HeaderLine>
        </GridLayout.Header>
        <GridLayout.Content>
          <XSBAuthUsersGrid
            rows={filtered as XSBUserRow[]}
            loading={datagrid_isloading}
            highlightTokens={
              state.datagrid_query?.q_text_search?.query
                ? [state.datagrid_query.q_text_search.query]
                : []
            }
          />
        </GridLayout.Content>
        <GridLayout.Footer>
          <GridQueryLimitSelect
            value={query.limit}
            onValueChange={query.onLimit}
          />
          <GridQueryCount count={filtered.length} keyword="user" />
          <GridRefreshButton
            refreshing={refresh.refreshing}
            onRefreshClick={refresh.refresh}
          />
        </GridLayout.Footer>
      </GridLayout.Root>
    </CurrentTable>
  );
}
