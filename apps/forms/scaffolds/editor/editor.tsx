"use client";

import React, { useCallback, useMemo } from "react";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import { FormEditorState } from "./state";
import { FieldEditPanel } from "../panels/field-edit-panel";
import { NewFormFieldInit } from "@/types";
import { createClientClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

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
      const promise = fetch("/private/editor/fields", {
        body: JSON.stringify({
          ...init,
          id: state.focus_field_id,
          form_id: form_id,
        }),
        method: "POST",
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to save field");
          }
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
    [closeFieldPanel, form_id, state.focus_field_id]
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
