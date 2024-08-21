"use client";

import React, { useCallback, useMemo } from "react";
import { StateProvider } from "./provider";
import { useEditorState } from "./use";
import { reducer } from "./reducer";
import {
  DatabaseDocumentEditorInit,
  EditorInit,
  FormDocumentEditorInit,
  SiteDocumentEditorInit,
} from "./state";
import { initialEditorState } from "./init";
import { FieldEditPanel, FormFieldSave } from "../panels/field-edit-panel";
import { FormFieldDefinition } from "@/types";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { RowEditPanel } from "../panels/response-edit-panel";
import { CustomerEditPanel } from "../panels/customer-panel";
import { MediaViewerProvider } from "../mediaviewer";
import { AssetsBackgroundsResolver } from "./resolver/assets-backgrounds-resolver";
import toast from "react-hot-toast";

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
}: React.PropsWithChildren<{ initial: DatabaseDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );
  return (
    <StateProvider state={state} dispatch={dispatch}>
      {children}
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
      {children}
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
          <FieldEditPanelProvider />
          <RowEditPanelProvider />
          <CustomerPanelProvider />
          {children}
        </MediaViewerProvider>
      </TooltipProvider>
    </StateProvider>
  );
}

function FieldEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const field = useMemo(() => {
    const focusfound = state.fields.find((f) => f.id === state.field_editor.id);
    if (focusfound) return focusfound;
    return state.field_editor.data?.draft;
  }, [state.field_editor.id, state.fields, state.field_editor.data?.draft]);

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
    (init: FormFieldSave) => {
      const data: FormFieldUpsert = {
        ...init,
        //
        options: init.options?.length ? init.options : undefined,
        optgroups: init.optgroups?.length ? init.optgroups : undefined,
        //
        id: state.field_editor.id ?? undefined,
        form_id: state.form_id,
        data: init.data,
      };

      // console.log("[EDITOR] saving..", data);

      const promise = fetch(`/private/editor/${state.form_id}/fields`, {
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
              type: "editor/field/save",
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
    [closeFieldPanel, state.form_id, state.field_editor.id, dispatch]
  );

  const is_existing_field = !!field?.id;

  return (
    <>
      <FieldEditPanel
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

function RowEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const focusresponse = useMemo(() => {
    return state.responses.stream?.find((r) => r.id === state.row_editor.id);
  }, [state.responses.stream, state.row_editor.id]);

  const focusxsupabasemaintablerow = useMemo(() => {
    const pk = state.x_supabase_main_table?.gfpk;
    if (!pk) return;
    return state.x_supabase_main_table?.rows?.find(
      (r) => r[pk] === state.row_editor.id // TODO: - pk
    );
  }, [
    state.x_supabase_main_table?.rows,
    state.x_supabase_main_table?.gfpk,
    state.row_editor.id,
  ]);

  return (
    <>
      <RowEditPanel
        key={focusresponse?.id}
        open={state.row_editor.open}
        init={{
          row: focusresponse,
          attributes: state.fields,
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
