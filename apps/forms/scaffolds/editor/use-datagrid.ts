"use client";

import { useMemo } from "react";
import type { GDocTable, GDocTableID } from "./state";
import { useCallback } from "react";
import { useEditorState } from "@/scaffolds/editor";
import type {
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
} from "@/scaffolds/editor/state";
import assert from "assert";
import {
  useStandaloneSchemaDataQueryConsumer,
  type DataQueryPaginationIndexDispatcher,
  type DataQueryPaginationLimitDispatcher,
  type DataQueryPaginationNextDispatcher,
  type DataQueryPaginationPrevDispatcher,
} from "../data-query";

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
    dispatch({ type: "editor/data-grid/refresh" });
  }, [dispatch]);

  return {
    refreshing: datagrid_isloading,
    refresh: refresh,
  };
}

export function useDatagridPagination() {
  const [state, dispatch] = useEditorState();
  const { datagrid_query, datagrid_query_estimated_count } = state;

  assert(datagrid_query);
  const { q_page_index, q_page_limit } = datagrid_query;

  const min = 0;
  const max =
    Math.ceil((datagrid_query_estimated_count ?? 0) / q_page_limit) - 1;

  const hasPrev = q_page_index > min;
  const hasNext = q_page_index < max;

  const onLimit: DataQueryPaginationLimitDispatcher = useCallback(
    (limit: number) => {
      dispatch({ type: "data/query/page-limit", limit });
    },
    [dispatch]
  );

  const onPaginate: DataQueryPaginationIndexDispatcher = useCallback(
    (index: number) => {
      dispatch({ type: "data/query/page-index", index });
    },
    [dispatch]
  );

  const onPrev: DataQueryPaginationPrevDispatcher = useCallback(() => {
    onPaginate(q_page_index - 1);
  }, [q_page_index, onPaginate]);

  const onNext: DataQueryPaginationNextDispatcher = useCallback(() => {
    onPaginate(q_page_index + 1);
  }, [q_page_index, onPaginate]);

  return {
    limit: q_page_limit,
    page: q_page_index,
    min,
    max,
    hasPrev,
    hasNext,
    onPaginate,
    onPrev,
    onNext,
    onLimit,
  };
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
    table?.x_sb_main_table_connection.sb_table_schema ?? null
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
