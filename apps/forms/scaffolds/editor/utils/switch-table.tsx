import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useEditorState } from "../use";
import type { GDocTableID } from "../state";
import { EditorSymbols } from "../symbols";

export function CurrentTable({
  table,
  fallback,
  children,
}: React.PropsWithChildren<{
  fallback?: React.ReactNode;
  table:
    | GDocTableID
    | typeof EditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR;
}>) {
  const [state, dispatch] = useEditorState();
  const [stale, setstale] = useState<boolean>(true);

  const tableid = useMemo(
    () =>
      table ===
      EditorSymbols.Table.SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR
        ? state.tables.find(
            (t) =>
              t.id ===
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
          )
          ? EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
          : EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
        : table,
    [table]
  );

  useLayoutEffect(() => {
    setstale(true);
    dispatch({
      type: "editor/data-grid/table",
      id: tableid,
    });
  }, [tableid]);

  useEffect(() => {
    setstale(state.datagrid_table_id !== tableid);
  }, [state.datagrid_table_id]);

  if (stale) {
    return fallback ? <>{fallback}</> : <></>;
  }
  return <>{children}</>;
}
