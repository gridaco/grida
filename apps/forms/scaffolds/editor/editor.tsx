"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import { FormEditorInit, initialFormEditorState } from "./state";
import { FieldEditPanel, FormFieldSave } from "../panels/field-edit-panel";
import { FormFieldDefinition } from "@/types";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ResponseEditPanel } from "../panels/response-edit-panel";
import { fmt_local_index } from "@/utils/fmt";
import { CustomerEditPanel } from "../panels/customer-panel";
import { BlockEditPanel } from "../panels/block-edit-panel";
import { MediaViewerProvider } from "../mediaviewer";
import toast from "react-hot-toast";

export function FormEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialFormEditorState(initial)
  );

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <TooltipProvider>
        <MediaViewerProvider>
          <BlockEditPanel />
          <FieldEditPanelProvider />
          <ResponseEditPanelProvider />
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
    return state.fields.find((f) => f.id === state.focus_field_id);
  }, [state.focus_field_id, state.fields]);

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
        options: init.options?.length ? init.options : undefined,
        //
        id: state.focus_field_id ?? undefined,
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
    [closeFieldPanel, state.form_id, state.focus_field_id, dispatch]
  );

  const is_existing_field = !!field;

  return (
    <>
      <FieldEditPanel
        key={field?.name || state.field_edit_panel_refresh_key}
        open={state.is_field_edit_panel_open}
        title={is_existing_field ? "Edit Field" : "New Field"}
        enableAI={!is_existing_field}
        mode={is_existing_field ? "edit" : "new"}
        formResetKey={state.field_edit_panel_refresh_key}
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
                pattern: field.pattern,
                step: field.step ?? undefined,
                min: field.min ?? undefined,
                max: field.max ?? undefined,
                autocomplete: field.autocomplete,
                data: field.data,
                accept: field.accept,
                multiple: field.multiple ?? undefined,
                options: field.options,
                storage: field.storage,
                reference: field.reference,
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

function ResponseEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const response = useMemo(() => {
    return state.responses?.rows?.find((r) => r.id === state.focus_response_id);
  }, [state.responses, state.focus_response_id]);

  return (
    <>
      <ResponseEditPanel
        key={response?.id}
        title={`Response ${response?.local_index ? fmt_local_index(response?.local_index) : ""}`}
        open={state.is_response_edit_panel_open}
        init={{
          response,
          response_fields: response?.id
            ? state.responses.fields[response?.id]
            : [],
          field_defs: state.fields,
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
        key={state.focus_customer_id}
        customer_id={state.focus_customer_id}
        open={state.is_customer_edit_panel_open}
        onOpenChange={(open) => {
          dispatch({ type: "editor/customers/edit", open });
        }}
      />
      {children}
    </>
  );
}
