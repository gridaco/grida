"use client";

import Invalid from "@/components/invalid";
import { useEditorState } from "@/scaffolds/editor";
import { GDocSchemaTable, GDocTable } from "@/scaffolds/editor/state";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridEditor } from "@/scaffolds/grid-editor";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { useMemo } from "react";

export default function SchemaTablePage({
  params,
}: {
  params: {
    tablename: string;
  };
}) {
  const [state] = useEditorState();
  const { tables, datagrid_table_id } = state;
  const { tablename } = params;

  const tb = tables
    .flatMap((table) => table.views)
    .find((table) => table.name === tablename);

  const isvalid = valid(tb);

  const { systemcolumns, columns } = useMemo(() => {
    if (!isvalid) return { systemcolumns: [], columns: [] };
    return datagrid_table_id
      ? GridData.columns(datagrid_table_id, tb.attributes)
      : { systemcolumns: [], columns: [] };
  }, [datagrid_table_id, tb]);

  if (!isvalid) {
    return <Invalid />;
  }

  return (
    <CurrentTable table={tb.id}>
      <GridEditor systemcolumns={systemcolumns} columns={columns} rows={[]} />
    </CurrentTable>
  );
}

function valid(tb?: GDocTable): // @ts-expect-error
tb is GDocSchemaTable {
  return !!tb && typeof tb.id === "string";
}
