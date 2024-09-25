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
import {
  useDataQueryOrderbyConsumer,
  useDataQueryPredicatesConsumer,
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

//
// #region query ========================================================================
//

export function useDataGridOrderby() {
  const [state, dispatch] = useEditorState();

  const table = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const consumer = useDataQueryOrderbyConsumer(
    [state.datagrid_query!, dispatch],
    table?.x_sb_main_table_connection.sb_table_schema ?? null
  );

  return {
    table,
    ...consumer,
  };
}

export function useDataGridPredicates() {
  const [state, dispatch] = useEditorState();

  const table = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const consumer = useDataQueryPredicatesConsumer(
    [state.datagrid_query!, dispatch],
    table?.x_sb_main_table_connection.sb_table_schema ?? null
  );

  return {
    table,
    ...consumer,
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
