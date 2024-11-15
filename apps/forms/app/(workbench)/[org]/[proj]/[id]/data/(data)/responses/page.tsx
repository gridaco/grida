"use client";

import Invalid from "@/components/invalid";
import {
  useDatagridTable,
  useEditorState,
  useFormFields,
} from "@/scaffolds/editor";
import {
  FormResponseFeedProvider,
  FormResponseSyncProvider,
  FormXSupabaseMainTableFeedProvider,
  XSBTableTransactionsQueueProvider,
} from "@/scaffolds/editor/feed";
import {
  GDocFormsXSBTable,
  GDocTable,
  GDocTableID,
} from "@/scaffolds/editor/state";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import { CurrentTable } from "@/scaffolds/editor/utils/current-table";
import { GridEditor } from "@/scaffolds/grid-editor";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { DGResponseRow } from "@/scaffolds/grid/types";
import assert from "assert";
import { useMemo } from "react";

export default function FormResponsesPage() {
  const [state] = useEditorState();
  const { doctype, datagrid_table_id } = state;

  if (doctype !== "v0_form") {
    return <Invalid />;
  }

  return (
    <CurrentTable
      table={EditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR}
    >
      {/* wait until state fully change */}
      {allowedtable(datagrid_table_id) && <SwitchGridEditor />}
    </CurrentTable>
  );
}

function SwitchGridEditor() {
  const [state] = useEditorState();
  const { datagrid_table_id } = state;
  const tb = useDatagridTable();

  if (!tb) return <Invalid />;
  switch (datagrid_table_id) {
    case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID:
      return (
        <>
          <FormResponseFeedProvider />
          <FormResponseSyncProvider />
          <FormResponseGridEditor />
        </>
      );
    case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID:
      assert(tb.provider === "x-supabase");
      return (
        <>
          <FormXSupabaseMainTableFeedProvider />
          <XSBTableTransactionsQueueProvider
            pk={tb.x_sb_main_table_connection.pk!}
            schema_table_id={state.form.form_id}
            sb_table_id={tb.x_sb_main_table_connection.sb_table_id}
          />
          <ModeXSBMainTable />
        </>
      );
    default:
      return <Invalid />;
  }
}

function FormResponseGridEditor() {
  const [state, dispatch] = useEditorState();
  const {
    form,
    tablespace,
    datagrid_local_filter,
    datagrid_query,
    datagrid_table_id,
  } = state;

  const tb = useDatagridTable<GDocTable>();

  const fields = useFormFields();

  const responses_stream =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID].stream;

  const { systemcolumns, columns } = useMemo(
    () =>
      GridData.columns({
        table_id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
        fields,
      }),
    [fields]
  );

  // Transforming the responses into the format expected by react-data-grid
  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      form_id: form.form_id,
      // TODO: types with symbols not working ?
      table: datagrid_table_id as any,
      fields: fields,
      filter: {
        empty_data_hidden: datagrid_local_filter.empty_data_hidden,
        text_search: datagrid_query?.q_text_search,
      },
      responses: responses_stream ?? [],
    });
  }, [
    form.form_id,
    datagrid_table_id,
    fields,
    responses_stream,
    datagrid_local_filter,
    datagrid_query?.q_text_search,
  ]);

  return (
    <>
      <GridEditor
        systemcolumns={systemcolumns}
        columns={columns}
        fields={fields}
        rows={filtered as DGResponseRow[]}
        readonly={false}
        selection={"on"}
        deletion={"on"}
      />
    </>
  );
}

function ModeXSBMainTable() {
  const [state, dispatch] = useEditorState();

  const {
    form,
    tablespace,
    datagrid_local_filter,
    datagrid_query,
    datagrid_table_id,
  } = state;

  const tb = useDatagridTable<GDocFormsXSBTable>();

  const fields = useFormFields();

  const stream =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID]
      .stream;

  const { systemcolumns, columns } = useMemo(
    () =>
      datagrid_table_id
        ? GridData.columns({
            table_id:
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
            fields,
            definition: tb!.x_sb_main_table_connection.definition,
          })
        : { systemcolumns: [], columns: [] },
    [datagrid_table_id, fields, tb]
  );

  const { filtered } = useMemo(() => {
    return GridData.rows({
      form_id: form.form_id,
      table: EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
      fields: fields,
      filter: {
        empty_data_hidden: datagrid_local_filter.empty_data_hidden,
        text_search: datagrid_query?.q_text_search,
      },
      data: {
        pks: tb?.x_sb_main_table_connection.pks ?? [],
        rows: stream ?? [],
      },
    });
  }, [
    form.form_id,
    fields,
    tb,
    stream,
    datagrid_local_filter,
    datagrid_query?.q_text_search,
  ]);

  if (!tb) {
    return <Invalid />;
  }

  return (
    <>
      <GridEditor
        systemcolumns={systemcolumns}
        columns={columns}
        fields={fields}
        rows={filtered as DGResponseRow[]}
        readonly={tb.readonly}
        selection="on"
        deletion="on"
      />
    </>
  );
}

function allowedtable(table: GDocTableID | null): boolean {
  return (
    table === EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID ||
    table === EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
  );
}
