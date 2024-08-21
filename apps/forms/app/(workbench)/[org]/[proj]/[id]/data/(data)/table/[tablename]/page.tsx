"use client";

import Invalid from "@/components/invalid";
import { useEditorState } from "@/scaffolds/editor";
import { CurrentTable } from "@/scaffolds/editor/utils/switch-table";
import { GridEditor } from "@/scaffolds/grid-editor";

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

  const tb = tables
    .flatMap((table) => table.views)
    .find((table) => table.name === tablename);

  if (!tb) {
    return <Invalid />;
  }

  return (
    <CurrentTable table={tb.id}>
      <GridEditor rows={[]} />
    </CurrentTable>
  );
}
