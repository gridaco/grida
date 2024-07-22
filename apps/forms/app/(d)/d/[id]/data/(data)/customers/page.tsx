"use client";

import { CustomerGrid } from "@/scaffolds/grid/customer-grid";
import { provisional } from "@/services/customer/utils";
import {
  GridLimit,
  GridViewSettings,
  GridRefresh,
  GridLocalSearch,
  GridCount,
  TableViews,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { MainTable } from "@/scaffolds/editor/utils/main-table";
import { useEditorState } from "@/scaffolds/editor";
import { CustomerFeedProvider } from "@/scaffolds/editor/feed";

export default function Customers() {
  const [state] = useEditorState();

  const { customers } = state;

  return (
    <MainTable table="customer">
      <CustomerFeedProvider />
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
          <CustomerGrid
            rows={
              customers?.map((customer) => ({
                uid: customer.uid,
                email: provisional(
                  customer.email,
                  customer.email_provisional
                ).join(", "),
                phone: provisional(
                  customer.phone,
                  customer.phone_provisional
                ).join(", "),
                created_at: customer.created_at,
                last_seen_at: customer.last_seen_at,
              })) || []
            }
          />
        </GridLayout.Content>
        <GridLayout.Footer>
          <GridLimit />
          <GridCount count={customers?.length ?? 0} />
          <GridRefresh />
        </GridLayout.Footer>
      </GridLayout.Root>
    </MainTable>
  );
}
