"use client";

import { CustomerGrid } from "@/scaffolds/grid/wellknown/customer-grid";
import { provisional } from "@/services/customer/utils";
import {
  GridQueryLimitSelect,
  GridViewSettings,
  GridRefreshButton,
  DataQueryTextSearch,
  GridQueryCount,
  TableViews,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { CurrentTable } from "@/scaffolds/editor/utils/current-table";
import { useEditorState } from "@/scaffolds/editor";
import { CustomerFeedProvider } from "@/scaffolds/editor/feed";
import { useMemo } from "react";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { Customer } from "@/types";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import {
  useDataGridTextSearch,
  useDataGridQuery,
  useDataGridRefresh,
} from "@/scaffolds/editor/use";

export default function Customers() {
  const [state] = useEditorState();

  const {
    datagrid_isloading,
    tablespace,
    datagrid_local_filter,
    datagrid_query,
  } = state;

  const stream =
    tablespace[EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID].stream;

  const refresh = useDataGridRefresh();
  const query = useDataGridQuery();
  const search = useDataGridTextSearch();

  const rows = useMemo(() => {
    const { filtered } = GridData.rows({
      filter: {
        empty_data_hidden: datagrid_local_filter.empty_data_hidden,
        text_search: datagrid_query?.q_text_search,
      },
      table: EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
      data: {
        rows: stream || [],
      },
    });

    const rows =
      (filtered as Customer[])?.map((customer: Customer) => ({
        uid: customer.uid,
        name: customer.name,
        email: provisional(customer.email, customer.email_provisional).join(
          ", "
        ),
        phone: provisional(customer.phone, customer.phone_provisional).join(
          ", "
        ),
        created_at: customer.created_at,
        last_seen_at: customer.last_seen_at,
      })) || [];

    return rows;
  }, [stream, datagrid_local_filter, datagrid_query?.q_text_search]);

  return (
    <CurrentTable table={EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID}>
      <CustomerFeedProvider />
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
          <CustomerGrid
            loading={datagrid_isloading}
            tokens={
              state.datagrid_query?.q_text_search?.query
                ? [state.datagrid_query?.q_text_search.query]
                : []
            }
            masked={state.datagrid_local_filter.masking_enabled}
            rows={rows}
          />
        </GridLayout.Content>
        <GridLayout.Footer>
          <GridQueryLimitSelect
            value={query.limit}
            onValueChange={query.onLimit}
          />
          <GridQueryCount count={rows.length} keyword="customer" />
          <GridRefreshButton
            refreshing={refresh.refreshing}
            onRefreshClick={refresh.refresh}
          />
        </GridLayout.Footer>
      </GridLayout.Root>
    </CurrentTable>
  );
}
