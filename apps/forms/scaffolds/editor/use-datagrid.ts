"use client";

import { useMemo } from "react";
import type { GDocTable, GDocTableID } from "./state";
import { useCallback } from "react";
import { useEditorState } from "@/scaffolds/editor";
import type {
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
} from "@/scaffolds/editor/state";
import type { SQLPredicate } from "@/types";
import assert from "assert";

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

//
// #region query ========================================================================
//

export function useDataGridOrderby() {
  const [state, dispatch] = useEditorState();

  const { datagrid_query } = state;
  assert(datagrid_query);

  const { q_orderby } = datagrid_query;

  const table = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const properties =
    table?.x_sb_main_table_connection.sb_table_schema.properties ?? {};

  const isset = Object.keys(q_orderby).length > 0;

  const keys = Object.keys(properties);
  const usedkeys = Object.keys(q_orderby);
  const unusedkeys = keys.filter((key) => !usedkeys.includes(key));

  const onClear = useCallback(() => {
    dispatch({ type: "editor/data-grid/query/orderby/clear" });
  }, [dispatch]);

  const onAdd = useCallback(
    (column_id: string) => {
      dispatch({
        type: "editor/data-grid/query/orderby",
        column_id: column_id,
        data: {},
      });
    },
    [dispatch]
  );

  const onUpdate = useCallback(
    (column_id: string, data: { ascending?: boolean }) => {
      dispatch({
        type: "editor/data-grid/query/orderby",
        column_id: column_id,
        data: data,
      });
    },
    [dispatch]
  );

  const onRemove = useCallback(
    (column_id: string) => {
      dispatch({
        type: "editor/data-grid/query/orderby",
        column_id: column_id,
        data: null,
      });
    },
    [dispatch]
  );

  return {
    table,
    orderby: q_orderby,
    isset,
    properties,
    usedkeys,
    unusedkeys,
    onClear,
    onAdd,
    onUpdate,
    onRemove,
  };
}

export function useDataGridPredicates() {
  const [state, dispatch] = useEditorState();

  const table = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const properties =
    table?.x_sb_main_table_connection.sb_table_schema.properties ?? {};

  const attributes = Object.keys(properties);

  const { datagrid_query } = state;
  assert(datagrid_query);

  const { q_predicates } = datagrid_query;

  const isset = q_predicates.length > 0;

  const add = useCallback(
    (predicate: SQLPredicate) => {
      dispatch({
        type: "editor/data-grid/query/predicates/add",
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const update = useCallback(
    (index: number, predicate: Partial<SQLPredicate>) => {
      dispatch({
        type: "editor/data-grid/query/predicates/update",
        index: index,
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const remove = useCallback(
    (index: number) => {
      dispatch({
        type: "editor/data-grid/query/predicates/remove",
        index: index,
      });
    },
    [dispatch]
  );

  const clear = useCallback(() => {
    dispatch({
      type: "editor/data-grid/query/predicates/clear",
    });
  }, [dispatch]);

  return {
    table,
    isset,
    properties,
    attributes,
    predicates: q_predicates,
    add,
    update,
    remove,
    clear,
  };
}

export function useDataGridQuery() {
  const { orderby, isset: is_orderby_set } = useDataGridOrderby();
  const { predicates, isset: is_predicates_set } = useDataGridPredicates();
  return {
    isset: is_orderby_set || is_predicates_set,
    is_orderby_set,
    is_predicates_set,
    orderby,
    predicates,
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
