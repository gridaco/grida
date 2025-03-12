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
import { useMemo } from "react";
import { Customer } from "@/types";
import { fetchCustomers } from "@/scaffolds/platform/customer/use-customer-feed";
import { useTableSpaceInstance } from "@/scaffolds/data-table";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { StandaloneDataQueryProvider } from "@/scaffolds/data-query";

export default function Customers() {
  return (
    <>
      <StandaloneDataQueryProvider>
        <Body />
      </StandaloneDataQueryProvider>
    </>
  );
}

function Body() {
  const client = useMemo(() => createClientWorkspaceClient(), []);
  // TODO:
  const project_id = 2;
  const tablespace = useTableSpaceInstance<Customer>({
    identifier: "uid",
    readonly: false,
    realtime: true,
    fetcher: (q) => fetchCustomers(client, project_id, q),
  });

  return (
    <GridLayout.Root>
      <GridLayout.Header>
        <GridLayout.HeaderLine>
          <GridLayout.HeaderMenus>
            {/* <TableViews /> */}
            <DataQueryTextSearch onValueChange={tablespace.onTextSearchQuery} />
          </GridLayout.HeaderMenus>
          <GridLayout.HeaderMenus>
            {/* <GridViewSettings /> */}
          </GridLayout.HeaderMenus>
        </GridLayout.HeaderLine>
      </GridLayout.Header>
      <GridLayout.Content>
        <CustomerGrid
          loading={tablespace.loading}
          tokens={
            tablespace.q_text_search ? [tablespace.q_text_search?.query] : []
          }
          // masked={state.datagrid_local_filter.masking_enabled}
          // rows={rows}
          rows={tablespace.stream || []}
        />
      </GridLayout.Content>
      <GridLayout.Footer>
        <GridQueryLimitSelect
          value={tablespace.limit}
          onValueChange={tablespace.onLimit}
        />
        <GridQueryCount count={tablespace.estimated_count} keyword="customer" />
        <GridRefreshButton
          refreshing={tablespace.loading}
          onRefreshClick={tablespace.onRefresh}
        />
      </GridLayout.Footer>
    </GridLayout.Root>
  );
}
