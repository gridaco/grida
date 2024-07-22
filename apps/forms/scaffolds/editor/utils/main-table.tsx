import React, { useEffect, useLayoutEffect, useState } from "react";
import { useEditorState } from "../provider";
import { FormEditorState } from "../state";

export function MainTable({
  table,
  children,
}: React.PropsWithChildren<{
  table: FormEditorState["datagrid_table"] | "main";
}>) {
  const [state, dispatch] = useEditorState();
  const [stale, setstale] = useState<boolean>(false);

  const tabletype =
    table === "main"
      ? state.x_supabase_main_table
        ? "x-supabase-main-table"
        : "response"
      : table;
  useLayoutEffect(() => {
    setstale(true);
    dispatch({
      type: "editor/data-grid/table",
      table: tabletype,
    });
  }, [table]);

  useEffect(() => {
    if (state.datagrid_table === tabletype) setstale(false);
  }, [state.datagrid_table]);

  // if (stale) return <></>;
  // if (state.datagrid_table === tabletype)
  // don't render children if the table is not the current table
  return <>{children}</>;
  return <></>;
}
