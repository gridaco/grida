"use client";

import { useMemo, useContext } from "react";
import type { EditorState } from "./state";
import { useDispatch, type FlatDispatcher } from "./dispatch";

import { Context } from "./provider";

export const useEditorState = (): [EditorState, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};

export function useCurrentTableView() {
  const [state] = useEditorState();
  const { datagrid_table_id, tables } = state;

  return useMemo(() => {
    return tables
      .flatMap((t) => t.views)
      .find((table) => table.id === datagrid_table_id);
  }, [datagrid_table_id, tables]);
}
