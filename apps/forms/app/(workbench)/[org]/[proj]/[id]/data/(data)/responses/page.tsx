"use client";

import Invalid from "@/components/invalid";
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
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { GFResponseRow } from "@/scaffolds/grid/types";
import { useMemo } from "react";

export default function FormResponsesPage() {
  const [state] = useEditorState();
  const { doctype, datagrid_table_id } = state;

  if (doctype !== "v0_form") {
    return <Invalid />;
  }

  return (
    <MainTable
      table={
        GridaEditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR
      }
    >
      <ResponseFeedProvider />
      <ResponseSyncProvider />
      <ResponseSessionFeedProvider />
      <XSupabaseMainTableFeedProvider />
      <XSupabaseMainTableSyncProvider />
      {/* wait until state fully change */}
      {allowedtable(datagrid_table_id) && <FormResponseGridEditor />}
    </MainTable>
  );
}

function FormResponseGridEditor() {
  const [state, dispatch] = useEditorState();
  const {
    form_id,
    fields,
    responses,
    sessions,
    datagrid_filter,
    datagrid_table_id,
    x_supabase_main_table,
  } = state;

  // Transforming the responses into the format expected by react-data-grid
  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      form_id: form_id,
      // TODO: types with symbols not working ?
      table: datagrid_table_id as any,
      fields: fields,
      filter: datagrid_filter,
      responses: responses.stream ?? [],
      sessions: sessions.stream ?? [],
      data: {
        pks: x_supabase_main_table?.pks ?? [],
        rows: x_supabase_main_table?.rows ?? [],
      },
    });
  }, [
    form_id,
    datagrid_table_id,
    sessions,
    fields,
    responses,
    x_supabase_main_table,
    datagrid_filter,
  ]);

  return <GridEditor rows={filtered as GFResponseRow[]} />;
}

function allowedtable(table: GDocTableID): boolean {
  return (
    table === GridaEditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID ||
    table === GridaEditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID ||
    table === GridaEditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
  );
}
