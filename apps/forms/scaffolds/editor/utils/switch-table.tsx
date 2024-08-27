import React, { useEffect, useLayoutEffect, useState } from "react";
import { useEditorState } from "../use";
import type { GDocTableID } from "../state";
import { EditorSymbols } from "../symbols";

export function CurrentTable({
  table,
  children,
}: React.PropsWithChildren<{
  table:
    | GDocTableID
    | typeof EditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR;
}>) {
  const [state, dispatch] = useEditorState();
  const [stale, setstale] = useState<boolean>(false);

  const tableid =
    table === EditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR
      ? state.tables.find(
          (t) =>
            t.id ===
            EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
        )
        ? EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
        : EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
      : table;
  useLayoutEffect(() => {
    setstale(true);
    dispatch({
      type: "editor/data-grid/table",
      id: tableid,
    });
  }, [table]);

  useEffect(() => {
    if (state.datagrid_table_id === tableid) setstale(false);
  }, [state.datagrid_table_id]);

  // if (stale) return <></>;
  // if (state.datagrid_table === tabletype)
  // don't render children if the table is not the current table
  return <>{children}</>;
  return <></>;
}
