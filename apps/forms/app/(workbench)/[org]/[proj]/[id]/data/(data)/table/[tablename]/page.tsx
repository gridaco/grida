"use client";

import EmptyWelcome from "@/components/empty";
import Invalid from "@/components/invalid";
import { useEditorState } from "@/scaffolds/editor";
import {
  GridaSchemaTableFeedProvider,
  GridaSchemaTableSyncProvider,
  GridaSchemaXSBTableFeedProvider,
  GridaSchemaXSBTableSyncProvider,
} from "@/scaffolds/editor/feed";
import {
  GDocSchemaTable,
  GDocSchemaTableProviderGrida,
  GDocSchemaTableProviderXSupabase,
  GDocTable,
  TablespaceSchemaTableStreamType,
} from "@/scaffolds/editor/state";
import { useDatagridTable } from "@/scaffolds/editor/use";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridEditor } from "@/scaffolds/grid-editor";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { GFResponseRow } from "@/scaffolds/grid/types";
import { TableIcon } from "@radix-ui/react-icons";
import assert from "assert";
import { useMemo } from "react";
import { Spinner } from "@/components/spinner";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";

export default function SchemaTablePage({
  params,
}: {
  params: {
    tablename: string;
  };
}) {
  const [{ tables, datagrid_table_id }] = useEditorState();
  const { tablename } = params;

  const tb = tables.find((table) => table.name === tablename);

  const isvalid = valid(tb);

  if (!isvalid) {
    if (tablename === "~new") {
      return (
        <EmptyWelcome
          art={<TableIcon className="w-10 h-10 text-muted-foreground" />}
          title={"Create your first table"}
          paragraph={"Let's get started by creating your first table."}
        />
      );
    }
    return <Invalid />;
  }

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
            <GridaSchemaXSBTableSyncProvider
              pk={tb.x_sb_main_table_connection.pk!}
              table_id={tb.id}
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
  const { tablespace, datagrid_filter } = state;

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
      attributes: tb.attributes,
      filter: datagrid_filter,
      rows: (stream as unknown as Array<
        TablespaceSchemaTableStreamType<GDocSchemaTableProviderGrida>
      >)!,
    });
  }, [stream, tb, datagrid_filter]);

  return (
    <GridEditor
      systemcolumns={systemcolumns}
      columns={columns}
      rows={filtered as GFResponseRow[]}
      readonly={tb.readonly}
      selection="on"
      deletion="on"
    />
  );
}

function ModeProviderXSB() {
  const [state] = useEditorState();
  const { tablespace, datagrid_filter } = state;

  const tb = useDatagridTable<GDocSchemaTableProviderXSupabase>();

  assert(tb, "table not found");

  const stream = tablespace[tb.id].stream;

  const { systemcolumns, columns } = useMemo(() => {
    return GridData.columns({
      table_id: tb.id,
      fields: tb.attributes,
      x_table_constraints: {
        pk: tb.x_sb_main_table_connection.pk,
        pks: tb.x_sb_main_table_connection.pks,
      },
    });
  }, [tb]);

  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      table_id: tb.id,
      table: "v0_schema_table",
      provider: "x-supabase",
      attributes: tb.attributes,
      filter: datagrid_filter,
      pks: tb.x_sb_main_table_connection.pks,
      rows: (stream as unknown as Array<
        TablespaceSchemaTableStreamType<GDocSchemaTableProviderXSupabase>
      >)!,
    });
  }, [stream, tb, datagrid_filter]);

  return (
    <GridEditor
      systemcolumns={systemcolumns}
      columns={columns}
      rows={filtered as GFResponseRow[]}
      readonly={tb.readonly}
      selection="on"
      deletion="on"
    />
  );
}

function valid(tb?: GDocTable): tb is GDocSchemaTable {
  return !!tb && typeof tb.id === "string";
}
