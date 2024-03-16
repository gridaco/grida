"use client";

import React from "react";
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
  const form_id = initial.form_id;
  const [state, dispatch] = React.useReducer(reducer, initial);
  return (
    <StateProvider state={state} dispatch={dispatch}>
      <FieldEditPanelProvider form_id={form_id}>
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

  return (
    <>
      <FieldEditPanel
        title={state.editing_field_id ? "Edit Field" : "New Field"}
        open={state.is_field_edit_panel_open}
        formResetKey={state.field_edit_panel_refresh_key}
        onOpenChange={(open) => {
          dispatch({ type: "editor/field/edit", open });
        }}
        onSubmit={onAddNewField}
      />

      {children}
    </>
  );
}
