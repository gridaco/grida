"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { XSBAuthUsersGrid } from "@/scaffolds/grid/wellknown/xsb-auth.users-grid";
import { GridaXSupabase } from "@/types";
import React, { useEffect, useMemo, useState } from "react";
import { XSBAuthUsersGridData } from "@/scaffolds/grid/wellknown/xsb-auth.users-grid-data";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import {
  GridQueryCount,
  GridQueryLimitSelect,
  GridRefreshButton,
  GridQueryPaginationControl,
  DataQueryTextSearch,
  GridLoadingProgressLine,
} from "@/scaffolds/grid-editor/components";
import {
  SchemaNameProvider,
  StandaloneDataQueryProvider,
  TableDefinitionProvider,
  useStandaloneSchemaDataQuery,
} from "@/scaffolds/data-query";
import { Data } from "@/lib/data";
import toast from "react-hot-toast";
import { useXSBListUsers } from "@/scaffolds/x-supabase";
import { DataPlatformProvider } from "@/scaffolds/data-query";

type SQLForeignKeyValue = string | number | undefined;

export function XSBListUsersSheet({
  onValueChange,
  relation,
  supabase_project_id,
  children,
  ...props
}: React.ComponentProps<typeof Sheet> & {
  onValueChange?: (value: SQLForeignKeyValue) => void;
  relation: {
    referenced_column: string;
  };
  supabase_project_id: number;
}) {
  return (
    <Sheet {...props}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="flex flex-col p-0 py-6 xl:w-[800px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none">
        <SheetHeader className="px-6">
          <SheetTitle>Search Reference</SheetTitle>
          <SheetDescription>
            Select a record to reference from <code>auth.users</code>
          </SheetDescription>
        </SheetHeader>
        <hr />
        <DataPlatformProvider
          platform={{ provider: "x-supabase", supabase_project_id }}
        >
          <SchemaNameProvider schema="auth">
            <StandaloneDataQueryProvider
              initial={{
                ...Data.Relation.INITIAL_QUERY_STATE,
                q_text_search: { query: "", column: null, type: "websearch" },
              }}
            >
              <XSBSearchTableDataGrid
                supabase_project_id={supabase_project_id}
                onRowDoubleClick={(row) => {
                  onValueChange?.(row[relation.referenced_column]);
                  props.onOpenChange?.(false);
                }}
              />
            </StandaloneDataQueryProvider>
          </SchemaNameProvider>
        </DataPlatformProvider>
      </SheetContent>
    </Sheet>
  );
}

function XSBSearchTableDataGrid({
  supabase_project_id,
  onRowDoubleClick,
}: {
  supabase_project_id: number;
  onRowDoubleClick?: (value: GridaXSupabase.XDataRow) => void;
}) {
  const [total, setTotal] = useState<number>();
  const query = useStandaloneSchemaDataQuery({
    estimated_count: total ?? null,
  });

  const { data, error, isLoading } = useXSBListUsers(supabase_project_id, {
    page: (query?.q_page_index ?? 0) + 1,
    perPage: query?.q_page_limit ?? 100,
    r: query?.q_refresh_key,
  });

  useEffect(() => {
    if (!data?.error) {
      if (data?.data.total) setTotal(data?.data.total);
    }
  }, [data]);

  useEffect(() => {
    if (data?.error) {
      console.error(data.error.message);
      toast.error(data.error.message);
    }
  }, [data?.error]);

  const filtered = useMemo(() => {
    return XSBAuthUsersGridData.rows(data?.data?.users ?? [], {
      search: query?.q_text_search?.query,
    });
  }, [data, query?.q_text_search]);

  return (
    <TableDefinitionProvider definition={{ pks: [], fks: [], properties: {} }}>
      <GridLayout.Root>
        <GridLayout.Header>
          <GridLayout.HeaderLine>
            <GridLayout.HeaderMenus>
              <GridLayout.HeaderMenuItems>
                <DataQueryTextSearch onValueChange={query.onTextSearchQuery} />
              </GridLayout.HeaderMenuItems>
            </GridLayout.HeaderMenus>
          </GridLayout.HeaderLine>
          <GridLoadingProgressLine loading={isLoading} />
        </GridLayout.Header>
        <GridLayout.Content>
          <XSBAuthUsersGrid
            loading={!data?.data}
            highlightTokens={
              query?.q_text_search?.query ? [query.q_text_search.query] : []
            }
            onRowDoubleClick={onRowDoubleClick}
            rows={filtered}
          />
        </GridLayout.Content>
        <GridLayout.Footer>
          <div className="flex gap-4 items-center">
            <GridQueryPaginationControl {...query} />
            <GridQueryLimitSelect
              value={query.q_page_limit}
              onValueChange={query.onLimit}
            />
          </div>
          <GridLayout.FooterSeparator />
          <GridQueryCount count={total} keyword="user" />
          <GridLayout.FooterSeparator />
          <GridRefreshButton
            onRefreshClick={query.onRefresh}
            refreshing={isLoading}
          />
        </GridLayout.Footer>
      </GridLayout.Root>
    </TableDefinitionProvider>
  );
}
