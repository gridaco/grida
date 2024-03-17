"use client";

import React, { useMemo } from "react";
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

  const supabase = createClientClient();

  const closeNewFieldPanel = (options: { refresh: boolean }) => {
    dispatch({
      type: "editor/field/edit",
      open: false,
      refresh: options.refresh,
    });
  };

  const onAddNewField = (init: NewFormFieldInit) => {
    supabase
      .from("form_field")
      .insert({
        form_id: form_id,
        type: init.type,
        name: init.name,
        label: init.label,
        placeholder: init.placeholder,
        help_text: init.helpText,
        required: init.required,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (data) {
          toast.success("New field added");
          closeNewFieldPanel({ refresh: true });
        } else {
          if (error.code === "23505") {
            toast.error(`field with name "${init.name}" already exists`);
            console.error(error);
            return;
          }
          toast.error("Failed to add new field");
          console.error(error);
        }
      });
  };

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
        onSubmit={onAddNewField}
      />

      {children}
    </>
  );
}
