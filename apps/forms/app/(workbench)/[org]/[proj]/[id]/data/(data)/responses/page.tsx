"use client";

import { useEditorState } from "@/scaffolds/editor";
import {
  ResponseFeedProvider,
  ResponseSessionFeedProvider,
  ResponseSyncProvider,
  XSupabaseMainTableFeedProvider,
  XSupabaseMainTableSyncProvider,
} from "@/scaffolds/editor/feed";
import { GDocTableID } from "@/scaffolds/editor/state";
import { GridaEditorSymbols } from "@/scaffolds/editor/symbols";
import { MainTable } from "@/scaffolds/editor/utils/main-table";
import { GridEditor } from "@/scaffolds/grid-editor";

export default function FormResponsesPage() {
  const [state] = useEditorState();
  const { datagrid_table_id } = state;
  return (
    <MainTable table="main">
      <ResponseFeedProvider />
      <ResponseSyncProvider />
      <ResponseSessionFeedProvider />
      <XSupabaseMainTableFeedProvider />
      <XSupabaseMainTableSyncProvider />
      {/* wait until state fully change */}
      {allowedtable(datagrid_table_id) && <GridEditor />}
    </MainTable>
  );
}

function allowedtable(table: GDocTableID): boolean {
  return (
    table === GridaEditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID ||
    table === GridaEditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID ||
    table === GridaEditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
  );
}
