"use client";

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
import { XSBAuthUsersGridData } from "@/scaffolds/grid/wellknown/xsb-auth.users-grid-data";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import {
  useDataGridTextSearch,
  useDataGridQuery,
  useDataGridRefresh,
} from "@/scaffolds/editor/use";
import { XSBAuthUsersGrid } from "@/scaffolds/grid/wellknown/xsb-auth.users-grid";
import { XSBUserRow } from "@/scaffolds/grid";
import { useXSBListUsers } from "@/scaffolds/x-supabase/use-xsb-list-users";
import assert from "assert";

export default function XAuthUsersTablePage() {
  const [state, dispatch] = useEditorState();
  const [total, setTotal] = useState<number>();

  const { supabase_project } = state;

  assert(supabase_project);

  const refresh = useDataGridRefresh();
  const query = useDataGridQuery({ estimated_count: total });
  const search = useDataGridTextSearch();

  const { data, isLoading, isValidating } = useXSBListUsers(
    supabase_project.id,
    {
      page: (query?.q_page_index ?? 0) + 1,
      perPage: query?.q_page_limit ?? 100,
      r: query?.q_refresh_key,
    }
  );

  useEffect(() => {
    dispatch({
      type: "editor/data-grid/loading",
      isloading: isLoading || isValidating,
    });
  }, [dispatch, isLoading, isValidating]);

  const filtered = useMemo(() => {
    return XSBAuthUsersGridData.rows(data?.data?.users ?? [], {
      search: query?.q_text_search?.query,
    });
  }, [data, query?.q_text_search]);

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
          <GridLoadingProgressLine loading={refresh.refreshing} />
        </GridLayout.Header>
        <GridLayout.Content>
          <XSBAuthUsersGrid
            rows={filtered as XSBUserRow[]}
            loading={refresh.refreshing}
            mask={state.datagrid_local_filter.masking_enabled}
            highlightTokens={
              query?.q_text_search?.query ? [query.q_text_search.query] : []
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
