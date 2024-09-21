"use client";

import { useCallback } from "react";
import { useDatagridTable, useEditorState } from "@/scaffolds/editor";
import type {
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
} from "@/scaffolds/editor/state";
import type { SQLPredicate } from "@/types";

export function useDataGridOrderby() {
  const [state, dispatch] = useEditorState();

  const { datagrid_orderby } = state;

  const table = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const properties =
    table?.x_sb_main_table_connection.sb_table_schema.properties ?? {};

  const isset = Object.keys(datagrid_orderby).length > 0;

  const keys = Object.keys(properties);
  const usedkeys = Object.keys(datagrid_orderby);
  const unusedkeys = keys.filter((key) => !usedkeys.includes(key));

  const onClear = useCallback(() => {
    dispatch({ type: "editor/data-grid/orderby/clear" });
  }, [dispatch]);

  const onAdd = useCallback(
    (column_id: string) => {
      dispatch({
        type: "editor/data-grid/orderby",
        column_id: column_id,
        data: {},
      });
    },
    [dispatch]
  );

  const onUpdate = useCallback(
    (column_id: string, data: { ascending?: boolean }) => {
      dispatch({
        type: "editor/data-grid/orderby",
        column_id: column_id,
        data: data,
      });
    },
    [dispatch]
  );

  const onRemove = useCallback(
    (column_id: string) => {
      dispatch({
        type: "editor/data-grid/orderby",
        column_id: column_id,
        data: null,
      });
    },
    [dispatch]
  );

  return {
    table,
    orderby: datagrid_orderby,
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

  const { datagrid_predicates: predicates } = state;

  const isset = predicates.length > 0;

  const add = useCallback(
    (predicate: SQLPredicate) => {
      dispatch({
        type: "editor/data-grid/predicates/add",
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const update = useCallback(
    (index: number, predicate: Partial<SQLPredicate>) => {
      dispatch({
        type: "editor/data-grid/predicates/update",
        index: index,
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const remove = useCallback(
    (index: number) => {
      dispatch({
        type: "editor/data-grid/predicates/remove",
        index: index,
      });
    },
    [dispatch]
  );

  const clear = useCallback(() => {
    dispatch({
      type: "editor/data-grid/predicates/clear",
    });
  }, [dispatch]);

  return {
    table,
    isset,
    properties,
    attributes,
    predicates,
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
    orderby,
    predicates,
  };
}
