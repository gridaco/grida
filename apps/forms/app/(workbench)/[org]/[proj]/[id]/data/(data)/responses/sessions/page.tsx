"use client";

import Invalid from "@/components/invalid";
import {
  useDatagridTable,
  useEditorState,
  useFormFields,
} from "@/scaffolds/editor";
import { FormResponseSessionFeedProvider } from "@/scaffolds/editor/feed";
import { GDocTable, GDocTableID } from "@/scaffolds/editor/state";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import { CurrentTable } from "@/scaffolds/editor/utils/current-table";
import { GridEditor } from "@/scaffolds/grid-editor";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import { DGResponseRow } from "@/scaffolds/grid/types";
import { useMemo } from "react";

export default function FormResponsesPage() {
  const [state] = useEditorState();
  const { doctype, datagrid_table_id } = state;

  if (doctype !== "v0_form") {
    return <Invalid />;
  }

  return (
    <CurrentTable table={EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID}>
      {/* wait until state fully change */}
      {allowedtable(datagrid_table_id) && (
        <>
          <FormResponseSessionFeedProvider />
          <FormResponseSessionGridEditor />
        </>
      )}
    </CurrentTable>
  );
}

function FormResponseSessionGridEditor() {
  const [state, dispatch] = useEditorState();
  const { form, tablespace, datagrid_local_filter, datagrid_query } = state;

  const tb = useDatagridTable<GDocTable>();

  const fields = useFormFields();

  const sessions_stream =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID].stream;

  const { systemcolumns, columns } = useMemo(
    () =>
      GridData.columns({
        table_id: EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID,
        fields,
      }),
    [fields]
  );

  // Transforming the responses into the format expected by react-data-grid
  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      form_id: form.form_id,
      table: EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID,
      fields: fields,
      filter: {
        empty_data_hidden: datagrid_local_filter.empty_data_hidden,
        text_search: datagrid_query?.q_text_search,
      },
      sessions: sessions_stream ?? [],
    });
  }, [
    form.form_id,
    sessions_stream,
    fields,
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
        readonly={true}
        selection={"off"}
        deletion={"off"}
      />
    </>
  );
}

function allowedtable(table: GDocTableID | null): boolean {
  return table === EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID;
}
