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
  GridQueryPaginationControl,
  GridLoadingProgressLine,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { useEffect, useMemo, useState } from "react";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import useSWR from "swr";
import {
  useDataGridTextSearch,
  useDataGridQuery,
  useDataGridRefresh,
} from "@/scaffolds/editor/use";
import { XSBAuthUsersGrid } from "@/scaffolds/grid/wellknown/xsb-auth.users-grid";
import { XSBUserRow } from "@/scaffolds/grid";
import { GridaXSupabase } from "@/types";

export default function XTablePage() {
  const [state, dispatch] = useEditorState();
  const [total, setTotal] = useState<number>();

  const { supabase_project, datagrid_isloading, datagrid_query } = state;

  const refresh = useDataGridRefresh();
  const query = useDataGridQuery({ estimated_count: total });
  const search = useDataGridTextSearch();

  const request = useMemo(() => {
    if (!supabase_project) return null;
    const request_url = PrivateEditorApi.XSupabase.url_x_auth_users_get(
      supabase_project.id,
      {
        page: (datagrid_query?.q_page_index ?? 0) + 1,
        perPage: datagrid_query?.q_page_limit ?? 100,
      }
    );

    if (datagrid_query?.q_refresh_key) {
      return request_url + "&r=" + datagrid_query.q_refresh_key;
    }

    return request_url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datagrid_query]);

  const { data, isLoading, isValidating } =
    useSWR<GridaXSupabase.ListUsersResult>(
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

  useEffect(() => {
    if (!data?.error) {
      if (data?.data.total) setTotal(data?.data.total);
    }
  }, [data]);

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
          <GridLoadingProgressLine />
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
          <div className="flex gap-4 items-center">
            <GridQueryPaginationControl {...query} />
            <GridQueryLimitSelect
              value={query.limit}
              onValueChange={query.onLimit}
            />
          </div>
          <GridLayout.FooterSeparator />
          <GridQueryCount count={total} keyword="user" />
          <GridRefreshButton
            refreshing={refresh.refreshing}
            onRefreshClick={refresh.refresh}
          />
        </GridLayout.Footer>
      </GridLayout.Root>
    </CurrentTable>
  );
}
