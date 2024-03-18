"use client";

import React, { useCallback, useMemo } from "react";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import { FormEditorState } from "./state";
import { FieldEditPanel } from "../panels/field-edit-panel";
import { FormFieldDefinition, NewFormFieldInit } from "@/types";
import { createClientClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";

export function FormEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormEditorState }>) {
  const [state, dispatch] = React.useReducer(reducer, initial);

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <FieldEditPanelProvider form_id={state.form_id}>
        {/*  */}
        {children}
      </FieldEditPanelProvider>
    </StateProvider>
  );
}

function FieldEditPanelProvider({
  form_id,
  children,
}: React.PropsWithChildren<{
  form_id: string;
}>) {
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
    (init: NewFormFieldInit) => {
      const data: FormFieldUpsert = {
        ...init,
        options: init.options?.length ? init.options : undefined,
        //
        id: state.focus_field_id,
        form_id: form_id,
      };

      console.log("saving..", data);

      const promise = fetch("/private/editor/fields", {
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

          // else save the field
          dispatch({
            type: "editor/field/save",
            field_id: data.id,
            data: data,
          });
        })
        .finally(() => {
          closeFieldPanel({ refresh: true });
        });

      toast.promise(promise, {
        loading: "Saving field...",
        success: "Field saved",
        error: "Failed to save field",
      });
    },
    [closeFieldPanel, form_id, state.focus_field_id, dispatch]
  );

  const is_existing_field = !!field;

  return (
    <>
      <FieldEditPanel
        key={field?.name}
        open={state.is_field_edit_panel_open}
        title={is_existing_field ? "Edit Field" : "New Field"}
        disableAI={is_existing_field}
        formResetKey={state.field_edit_panel_refresh_key}
        init={
          field
            ? {
                name: field.name,
                type: field.type,
                label: field.label ?? "",
                helpText: field.help_text ?? "",
                placeholder: field.placeholder ?? "",
                // options: field.options,
                required: field.required,
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
