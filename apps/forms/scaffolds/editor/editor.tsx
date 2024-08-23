"use client";

import React, { useCallback, useMemo } from "react";
import { StateProvider } from "./provider";
import { useEditorState, useFormFields, useDatabaseTableId } from "./use";
import { reducer } from "./reducer";
import {
  SchemaDocumentEditorInit,
  EditorInit,
  FormDocumentEditorInit,
  SiteDocumentEditorInit,
} from "./state";
import { initialEditorState } from "./init";
import { FieldEditPanel, FieldSave } from "../panels/field-edit-panel";
import { FormFieldDefinition } from "@/types";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { RowEditPanel } from "../panels/row-edit-panel";
import { CustomerEditPanel } from "../panels/customer-panel";
import { MediaViewerProvider } from "../mediaviewer";
import { AssetsBackgroundsResolver } from "./resolver/assets-backgrounds-resolver";
import toast from "react-hot-toast";
import { EditorSymbols } from "./symbols";
import Invalid from "@/components/invalid";
import { fmt_local_index } from "@/utils/fmt";

export function EditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: EditorInit }>) {
  switch (initial.doctype) {
    case "v0_form":
      return (
        <FormDocumentEditorProvider initial={initial}>
          <AssetsBackgroundsResolver />
          {children}
        </FormDocumentEditorProvider>
      );
    case "v0_site":
      return (
        <SiteDocumentEditorProvider initial={initial}>
          <AssetsBackgroundsResolver />
          {children}
        </SiteDocumentEditorProvider>
      );
    case "v0_schema":
      return (
        <DatabaseDocumentEditorProvider initial={initial}>
          <AssetsBackgroundsResolver />
          {children}
        </DatabaseDocumentEditorProvider>
      );
    default:
      throw new Error("unsupported doctype");
  }
}

export function DatabaseDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: SchemaDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );
  return (
    <StateProvider state={state} dispatch={dispatch}>
      <TooltipProvider>
        {/*  */}
        <FormFieldEditPanelProvider />
        <RowEditPanelProvider />
        {children}
      </TooltipProvider>
    </StateProvider>
  );
}

export function SiteDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: SiteDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );
  return (
    <StateProvider state={state} dispatch={dispatch}>
      <TooltipProvider>
        {/*  */}
        {children}
      </TooltipProvider>
    </StateProvider>
  );
}

export function FormDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <TooltipProvider>
        <MediaViewerProvider>
          <FormFieldEditPanelProvider />
          <RowEditPanelProvider />
          <CustomerPanelProvider />
          {children}
        </MediaViewerProvider>
      </TooltipProvider>
    </StateProvider>
  );
}

function useAttributes() {
  const [state] = useEditorState();
  switch (state.doctype) {
    case "v0_form":
      return state.form.fields;
    case "v0_schema": {
      const tb = state.tables.find((t) => t.id === state.datagrid_table_id);
      if (!tb) return [];
      if ("attributes" in tb) {
        return tb.attributes;
      }
    }
    default: {
      return [];
    }
  }
}

function FormFieldEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const attributes = useAttributes();

  const table_id = useDatabaseTableId();

  const field = useMemo(() => {
    const focusfound = attributes?.find((f) => f.id === state.field_editor.id);
    if (focusfound) return focusfound;
    return state.field_editor.data?.draft;
  }, [state.field_editor.id, attributes, state.field_editor.data?.draft]);

  const closeFieldPanel = useCallback(
    (options: { refresh: boolean }) => {
      dispatch({
        type: "editor/field/edit",
        open: false,
        refresh: options.refresh,
      });
    },
    [dispatch]
  );

  const onSaveField = useCallback(
    (init: FieldSave) => {
      const data: FormFieldUpsert = {
        ...init,
        //
        options: init.options?.length ? init.options : undefined,
        optgroups: init.optgroups?.length ? init.optgroups : undefined,
        //
        id: state.field_editor.id ?? undefined,
        form_id: table_id,
        data: init.data,
      };

      process.env.NODE_ENV === "development" &&
        console.log("[EDITOR] saving..", data);

      const promise = fetch(`/private/editor/${table_id}/fields`, {
        body: JSON.stringify(data),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Failed to save field");
          }

          const { data } =
            (await res.json()) as EditorApiResponse<FormFieldDefinition>;

          if (data) {
            // else save the field
            dispatch({
              type: "editor/table/attribute/change",
              table_id: table_id,
              field_id: data.id,
              data: data,
            });

            // only close when successful
            closeFieldPanel({ refresh: true });
          }
        })
        .finally(() => {
          //
        });

      toast.promise(promise, {
        loading: "Saving field...",
        success: "Field saved",
        error: "Failed to save field",
      });
    },
    [closeFieldPanel, table_id, state.field_editor.id, dispatch]
  );

  const is_existing_field = !!field?.id;

  return (
    <>
      <FieldEditPanel
        table_id={table_id}
        key={field?.name || state.field_editor.refreshkey}
        open={state.field_editor.open}
        title={is_existing_field ? "Edit Field" : "New Field"}
        enableAI={!is_existing_field}
        mode={is_existing_field ? "edit" : "new"}
        formResetKey={state.field_editor.refreshkey}
        init={
          field
            ? {
                id: field.id,
                name: field.name,
                type: field.type,
                label: field.label ?? "",
                help_text: field.help_text ?? "",
                placeholder: field.placeholder ?? "",
                required: field.required,
                readonly: field.readonly,
                pattern: field.pattern,
                step: field.step ?? undefined,
                min: field.min ?? undefined,
                max: field.max ?? undefined,
                autocomplete: field.autocomplete,
                data: field.data,
                accept: field.accept,
                multiple: field.multiple ?? undefined,
                options: field.options,
                optgroups: field.optgroups,
                storage: field.storage,
                reference: field.reference,
                v_value: field.v_value,
                // TODO: add inventory support
                // options_inventory: undefined,
              }
            : undefined
        }
        onOpenChange={(open) => {
          dispatch({ type: "editor/field/edit", open });
        }}
        onSave={onSaveField}
      />

      {children}
    </>
  );
}

function useRowEditorRow() {
  const [state, dispatch] = useEditorState();

  const row = useMemo(() => {
    switch (state.doctype) {
      case "v0_form":
        const response_stream =
          state.tablespace[
            EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
          ].stream;

        return response_stream?.find((r) => r.id === state.row_editor.id);
      default:
        return undefined;
    }
  }, [state.doctype, state.tablespace, state.row_editor.id]);

  return row;
}

function RowEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const attributes = useAttributes();

  const row = useRowEditorRow();

  const table_id = useDatabaseTableId();

  // const focusxsupabasemaintablerow = useMemo(() => {
  //   const pk = state.x_supabase_main_table?.gfpk;
  //   if (!pk) return;
  //   return state.x_supabase_main_table?.rows?.find(
  //     (r) => r[pk] === state.row_editor.id // TODO: - pk
  //   );
  // }, [
  //   state.x_supabase_main_table?.rows,
  //   state.x_supabase_main_table?.gfpk,
  //   state.row_editor.id,
  // ]);

  return (
    <>
      <RowEditPanel
        key={row?.id}
        table_id={table_id}
        open={state.row_editor.open}
        title={
          row
            ? `Response ${row.meta.local_index ? fmt_local_index(row.meta.local_index) : ""}`
            : "New"
        }
        attributes={attributes}
        init={{
          row: row,
        }}
        onOpenChange={(open) => {
          dispatch({ type: "editor/responses/edit", open });
        }}
      />
      {children}
    </>
  );
}

function CustomerPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  return (
    <>
      <CustomerEditPanel
        key={state.customer_editor.id}
        customer_id={state.customer_editor.id}
        open={state.customer_editor.open}
        onOpenChange={(open) => {
          dispatch({ type: "editor/customers/edit", open });
        }}
      />
      {children}
    </>
  );
}
