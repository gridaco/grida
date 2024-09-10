"use client";

import { useMemo, useContext, useCallback } from "react";
import type { EditorState, GDocTable, GDocTableID } from "./state";
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

/**
 * @example
 * ```ts
 * const t = useDocumentTranslations()
 * ```
 */
export function useDocumentTranslations() {
  const [state, dispatch] = useEditorState();
  const { lang, lang_default, resources: messages } = state.document.g11n;
  //

  return useCallback(
    (key: string) => {
      return messages[lang]?.[key];
    },
    [lang, messages]
  );
}

export function useG11nResource(key: string) {
  // const onEditTitle = useCallback(
  //   (title: string) => {
  //     dispatch({
  //       type: "blocks/title",
  //       block_id: id,
  //       title_html: title,
  //     });
  //   },
  //   [dispatch, id]
  // );

  // const onEditDescription = useCallback(
  //   (description: string) => {
  //     dispatch({
  //       type: "blocks/description",
  //       block_id: id,
  //       description_html: description,
  //     });
  //   },
  //   [dispatch, id]
  // );

  const [state, dispatch] = useEditorState();
  const { lang, lang_default, resources } = state.document.g11n;

  const fallback = useMemo(() => {
    return resources[lang_default]?.[key];
  }, [lang_default, resources, key]);

  const value = useMemo(() => {
    return resources[lang]?.[key];
  }, [lang, resources, key]);

  const change = useCallback(
    (message?: string) => {
      dispatch({
        type: "editor/document/langs/messages/change",
        key: key,
        message: message,
        lang: lang,
      });
    },
    [key, lang, dispatch]
  );

  return {
    fallback,
    value,
    change,
    lang,
    lang_default,
    isTranslationMode: lang !== lang_default,
  };
}
