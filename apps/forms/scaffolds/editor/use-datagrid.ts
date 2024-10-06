"use client";

import { useMemo } from "react";
import type { GDocTable, GDocTableID } from "./state";
import { useCallback } from "react";
import { useEditorState } from "@/scaffolds/editor";
import type {
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
} from "@/scaffolds/editor/state";
import { useStandaloneSchemaDataQueryConsumer } from "../data-query";
import { useDebounceCallback } from "usehooks-ts";

export function useDatagridTable<T extends GDocTable>():
  | Extract<GDocTable, T>
  | undefined {
  const [state] = useEditorState();
  const { datagrid_table_id, tables } = state;

  return useTable<T>(datagrid_table_id);
}

export function useDatagridTableSpace() {
  const [state] = useEditorState();
  const { tablespace } = state;

  const tb = useDatagridTable();

  return tb && tablespace[tb.id];
}

export function useDataGridRefresh() {
  const [state, dispatch] = useEditorState();
  const { datagrid_isloading } = state;

  const refresh = useCallback(() => {
    dispatch({ type: "data/query/refresh" });
  }, [dispatch]);

  return {
    refreshing: datagrid_isloading,
    refresh: refresh,
  };
}

export function useDataGridTextSearch(delay: number = 250) {
  const [state, dispatch] = useEditorState();

  return useDebounceCallback((txt: string) => {
    dispatch({
      type: "data/query/textsearch/query",
      query: txt,
    });
  }, delay);
}

//
// #region query ========================================================================
//

export function useDataGridQuery() {
  const [state, dispatch] = useEditorState();
  const table = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const query = useStandaloneSchemaDataQueryConsumer(
    [state.datagrid_query!, dispatch],
    {
      estimated_count: state.datagrid_query_estimated_count,
    }
  );

  return {
    table,
    ...query,
  };
}
// #endregion query ========================================================================

// #region data ========================================================================

export function useTable<T extends GDocTable>(
  table_id: GDocTableID | null
): Extract<GDocTable, T> | undefined {
  const [state] = useEditorState();
  const { tables } = state;
  return useMemo(() => {
    return tables.find((table) => table.id === table_id) as Extract<
      GDocTable,
      T
    >;
  }, [table_id, tables]);
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
 * TODO: will be removed or fixed after state migration - all table shall have `attributes` property
 *
 * @deprecated
 */
export function useDatagridTableAttributes() {
  const [state] = useEditorState();
  const { doctype, form } = state;
  const tb = useDatagridTable();

  switch (doctype) {
    case "v0_form":
      return state.form.fields;
    case "v0_schema":
      return tb ? ("attributes" in tb ? tb.attributes : null) : null;
    case "v0_site":
    default:
      throw new Error("useDatagridTableAttributes: not a table document");
  }
}

/**
 * returns a real table id, not a symbol. - used for actual db operations
 * @returns table_id
 */
export function useDatabaseTableId(): string | null {
  const [state] = useEditorState();
  // TODO: clean this up. temporary fix for supporting v0_form and v0_schema
  const table_id: string =
    state.doctype === "v0_form"
      ? state.form.form_id
      : (state.datagrid_table_id as string);

  return table_id;
}

// #endregion data ========================================================================
