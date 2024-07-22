"use client";

import { useEditorState } from "@/scaffolds/editor";
import {
  ResponseFeedProvider,
  ResponseSessionFeedProvider,
  ResponseSyncProvider,
  XSupabaseMainTableFeedProvider,
  XSupabaseMainTableSyncProvider,
} from "@/scaffolds/editor/feed";
import { FormEditorState } from "@/scaffolds/editor/state";
import { MainTable } from "@/scaffolds/editor/utils/main-table";
import { GridEditor } from "@/scaffolds/grid-editor";

export default function FormResponsesPage() {
  const [state] = useEditorState();
  const { datagrid_table } = state;
  return (
    <MainTable table="main">
      <ResponseFeedProvider />
      <ResponseSyncProvider />
      <ResponseSessionFeedProvider />
      <XSupabaseMainTableFeedProvider />
      <XSupabaseMainTableSyncProvider />
      {/* wait until state fully change */}
      {allowedtable(datagrid_table) && <GridEditor />}
    </MainTable>
  );
}

function allowedtable(table: FormEditorState["datagrid_table"]): boolean {
  return (
    table === "response" ||
    table === "session" ||
    table === "x-supabase-main-table"
  );
}
