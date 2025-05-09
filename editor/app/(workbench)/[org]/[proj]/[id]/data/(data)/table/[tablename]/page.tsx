"use client";

import Invalid from "@/components/invalid";
import { useEditorState } from "@/scaffolds/editor";
import {
  GridaSchemaTableFeedProvider,
  GridaSchemaTableSyncProvider,
  GridaSchemaXSBTableFeedProvider,
  XSBTableTransactionsQueueProvider,
} from "@/scaffolds/editor/feed";
import {
  GDocSchemaTable,
  GDocSchemaTableProviderGrida,
  GDocSchemaTableProviderXSupabase,
  TablespaceSchemaTableStreamType,
} from "@/scaffolds/editor/state";
import { useDatagridTable } from "@/scaffolds/editor/use";
import { CurrentTable } from "@/scaffolds/editor/utils/current-table";
import { GridEditor } from "@/scaffolds/grid-editor";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { DGResponseRow } from "@/scaffolds/grid/types";
import assert from "assert";
import { useMemo, use } from "react";
import { Spinner } from "@/components/spinner";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";

export default function SchemaTablePage(props: {
  params: Promise<{
    tablename: string;
  }>;
}) {
  const params = use(props.params);
  const [{ tables }] = useEditorState();
  const { tablename } = params;

  const tb = tables.find(
    (table) => table.name === tablename
  ) as GDocSchemaTable;

  // its already handled on layout
  assert(tb);

  return (
    <CurrentTable
      table={tb.id}
      fallback={
        <GridLayout.Root>
          <div className="w-full h-full flex items-center justify-center">
            <Spinner />
          </div>
        </GridLayout.Root>
      }
    >
      <SwitchGridEditor key={tb.id} />
    </CurrentTable>
  );
}

function SwitchGridEditor() {
  const tb = useDatagridTable<GDocSchemaTable>();

  if (!tb) return <Invalid />;
  switch (tb.provider) {
    case "grida":
      return (
        <>
          <GridaSchemaTableFeedProvider table_id={tb.id} />
          {!tb.readonly && <GridaSchemaTableSyncProvider table_id={tb.id} />}
          <ModeProviderGrida />
        </>
      );
    case "x-supabase":
      return (
        <>
          {!tb.readonly && (
            <XSBTableTransactionsQueueProvider
              pk={tb.x_sb_main_table_connection.pk!}
              schema_table_id={tb.id}
              sb_table_id={tb.x_sb_main_table_connection.sb_table_id}
            />
          )}
          <GridaSchemaXSBTableFeedProvider
            table_id={tb.id}
            sb_table_id={tb.x_sb_main_table_connection.sb_table_id}
          />
          <ModeProviderXSB />
        </>
      );
  }
}

function ModeProviderGrida() {
  const [state] = useEditorState();
  const { tablespace, datagrid_local_filter, datagrid_query } = state;

  const tb = useDatagridTable<GDocSchemaTableProviderGrida>();

  assert(tb, "table not found");

  const stream = tablespace[tb.id].stream;

  const { systemcolumns, columns } = useMemo(() => {
    return GridData.columns({ table_id: tb.id, fields: tb.attributes });
  }, [tb]);

  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      table_id: tb.id,
      table: "v0_schema_table",
      provider: "grida",
      fields: tb.attributes,
      filter: {
        empty_data_hidden: datagrid_local_filter.empty_data_hidden,
        text_search: datagrid_query?.q_text_search,
      },
      rows: (stream as unknown as Array<
        TablespaceSchemaTableStreamType<GDocSchemaTableProviderGrida>
      >)!,
    });
  }, [stream, tb, datagrid_local_filter, datagrid_query?.q_text_search]);

  return (
    <GridEditor
      systemcolumns={systemcolumns}
      columns={columns}
      fields={tb.attributes}
      rows={filtered as DGResponseRow[]}
      readonly={tb.readonly}
      selection="on"
      deletion="on"
    />
  );
}

function ModeProviderXSB() {
  const [state] = useEditorState();
  const { tablespace, datagrid_local_filter, datagrid_query } = state;

  const tb = useDatagridTable<GDocSchemaTableProviderXSupabase>();

  assert(tb, "table not found");

  const stream = tablespace[tb.id].stream;

  const { systemcolumns, columns } = useMemo(() => {
    return GridData.columns({
      table_id: tb.id,
      fields: tb.attributes,
      definition: tb.x_sb_main_table_connection.definition,
    });
  }, [tb]);

  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      table_id: tb.id,
      table: "v0_schema_table",
      provider: "x-supabase",
      fields: tb.attributes,
      filter: {
        empty_data_hidden: datagrid_local_filter.empty_data_hidden,
        text_search: datagrid_query?.q_text_search,
      },
      pks: tb.x_sb_main_table_connection.pks,
      rows: (stream as unknown as Array<
        TablespaceSchemaTableStreamType<GDocSchemaTableProviderXSupabase>
      >)!,
    });
  }, [stream, tb, datagrid_local_filter, datagrid_query?.q_text_search]);

  return (
    <GridEditor
      systemcolumns={systemcolumns}
      columns={columns}
      fields={tb.attributes}
      rows={filtered as DGResponseRow[]}
      readonly={tb.readonly}
      selection="on"
      deletion="on"
    />
  );
}
