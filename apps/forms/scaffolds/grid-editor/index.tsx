"use client";

import React, { useCallback, useState } from "react";
import { Grid } from "../grid";
import type { NewFormFieldInit } from "@/types";
import { createClientClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@editor-ui/alert-dialog";
import toast from "react-hot-toast";
import { FieldEditPanel } from "../panels/field-edit-panel";
import { FormEditorProvider } from "../editor";

export function GridEditor({
  form_id,
  ...props
}: React.ComponentProps<typeof Grid> & {
  form_id: string;
}) {
  const [newFieldPanelOpen, setNewFieldPanelOpen] = useState(false);
  const [newFieldPanelRefreshKey, setNewFieldPanelRefreshKey] = useState(0);
  const [deleteFieldConfirmOpen, setDeleteFieldConfirmOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const openNewFieldPanel = () => {
    setNewFieldPanelRefreshKey((k) => k + 1);
    setNewFieldPanelOpen(true);
  };

  const closeNewFieldPanel = (options: { refresh: boolean }) => {
    setNewFieldPanelOpen(false);
    if (options.refresh) {
      setNewFieldPanelRefreshKey((k) => k + 1);
    }
  };

  const openDeleteFieldConfirm = () => {
    setDeleteFieldConfirmOpen(true);
  };

  const closeDeleteFieldConfirm = () => {
    setDeleteFieldConfirmOpen(false);
  };

  const supabase = createClientClient();

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

  const onDeleteField = useCallback(() => {
    supabase
      .from("form_field")
      .delete({
        count: "exact",
      })
      .eq("id", focusedField!)
      .then(({ error, count }) => {
        if (count === 0) {
          toast.error("Failed to delete field");
          return;
        }
        if (error) {
          toast.error("Failed to delete field");
          console.error(error);
          return;
        }
        toast.success("Field deleted");
      });
  }, [supabase, focusedField]);

  return (
    <FormEditorProvider
      initial={{
        blocks: [], // TODO:
        fields: [], // TODO:
        form_id: form_id,
      }}
    >
      <DeleteFieldConfirmDialog
        open={deleteFieldConfirmOpen}
        onOpenChange={setDeleteFieldConfirmOpen}
        onCancel={closeDeleteFieldConfirm}
        onDeleteConfirm={onDeleteField}
      />
      <FieldEditPanel
        title={focusedField ? "Edit Field" : "Add New Field"}
        open={newFieldPanelOpen}
        onOpenChange={setNewFieldPanelOpen}
        formResetKey={newFieldPanelRefreshKey}
        onSubmit={onAddNewField}
      />
      <Grid
        columns={props.columns}
        rows={props.rows}
        onAddNewFieldClick={openNewFieldPanel}
        onEditFieldClick={(field_id) => {
          setFocusedField(field_id);
          openNewFieldPanel();
        }}
        onDeleteFieldClick={(field_id) => {
          setFocusedField(field_id);
          openDeleteFieldConfirm();
        }}
      />
    </FormEditorProvider>
  );
}

function DeleteFieldConfirmDialog({
  onCancel,
  onDeleteConfirm,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  onCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete Field</AlertDialogTitle>
        <AlertDialogDescription>
          Deleting this field will remove all data associated with it. Are you
          sure you want to delete this field?
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 p-2">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDeleteConfirm}>
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
