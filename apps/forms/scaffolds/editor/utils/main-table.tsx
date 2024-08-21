import React, { useEffect, useLayoutEffect, useState } from "react";
import { useEditorState } from "../use";
import type { GDocTableID } from "../state";
import { GridaEditorSymbols } from "../symbols";

export function MainTable({
  table,
  children,
}: React.PropsWithChildren<{
  table:
    | GDocTableID
    | typeof GridaEditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR;
}>) {
  const [state, dispatch] = useEditorState();
  const [stale, setstale] = useState<boolean>(false);

  const tableid =
    table ===
    GridaEditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR
      ? state.x_supabase_main_table
        ? GridaEditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
        : GridaEditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
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
