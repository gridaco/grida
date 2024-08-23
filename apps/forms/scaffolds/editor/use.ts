"use client";

import { useMemo, useContext } from "react";
import type { EditorState, GDocTable } from "./state";
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

export function useDatagridTable<T extends GDocTable>():
  | Extract<GDocTable, T>
  | undefined {
  const [state] = useEditorState();
  const { datagrid_table_id, tables } = state;

  return useMemo(() => {
    return tables.find((table) => table.id === datagrid_table_id) as Extract<
      GDocTable,
      T
    >;
  }, [datagrid_table_id, tables]);
}

export function useFormFields() {
  const [state] = useEditorState();
  const { doctype, form } = state;

  if (doctype !== "v0_form") {
    throw new Error("useFormFields: not a form document");
  }

  return form.fields;
}

/**
 * returns a real table id, not a symbol. - used for actual db operations
 * @returns table_id
 */
export function useDatabaseTableId(): string {
  const [state] = useEditorState();
  // TODO: clean this up. temporary fix for supporting v0_form and v0_schema
  const table_id: string =
    state.doctype === "v0_form"
      ? state.form_id
      : (state.datagrid_table_id as string);

  return table_id;
}
