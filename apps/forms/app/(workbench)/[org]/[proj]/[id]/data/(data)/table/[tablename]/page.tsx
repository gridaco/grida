"use client";

import EmptyWelcome from "@/components/empty";
import Invalid from "@/components/invalid";
import { useEditorState } from "@/scaffolds/editor";
import {
  SchemaTableFeedProvider,
  SchemaTableSyncProvider,
} from "@/scaffolds/editor/feed";
import { GDocSchemaTable, GDocTable } from "@/scaffolds/editor/state";
import { useDatagridTable } from "@/scaffolds/editor/use";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridEditor } from "@/scaffolds/grid-editor";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { GFResponseRow } from "@/scaffolds/grid/types";
import { TableIcon } from "@radix-ui/react-icons";
import assert from "assert";
import { useMemo } from "react";

export default function SchemaTablePage({
  params,
}: {
  params: {
    tablename: string;
  };
}) {
  const [state] = useEditorState();
  const { tables } = state;
  const { tablename } = params;

  const tb = tables.find((table) => table.name === tablename);

  const isvalid = valid(tb);

  if (!isvalid) {
    if (tablename === "new") {
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
    <CurrentTable table={tb.id}>
      <SchemaTableFeedProvider />
      <SchemaTableSyncProvider />
      <SchemaTableGridEditor />
    </CurrentTable>
  );
}

function SchemaTableGridEditor() {
  const [state] = useEditorState();
  const { tablespace, datagrid_filter } = state;

  const tb = useDatagridTable<GDocSchemaTable>();

  assert(tb, "table not found");

  const stream = tablespace[tb.id].stream;

  const { systemcolumns, columns } = useMemo(() => {
    return GridData.columns(tb.id, tb.attributes);
  }, [tb]);

  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      table_id: tb.id,
      table: "v0_schema_table",
      attributes: tb.attributes,
      filter: datagrid_filter,
      rows: stream!,
    });
  }, [stream, tb, datagrid_filter]);

  return (
    <GridEditor
      systemcolumns={systemcolumns}
      columns={columns}
      rows={filtered as GFResponseRow[]}
    />
  );
}

function valid(tb?: GDocTable): tb is GDocSchemaTable {
  return !!tb && typeof tb.id === "string";
}
