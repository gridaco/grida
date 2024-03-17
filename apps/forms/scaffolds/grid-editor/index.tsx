"use client";

import React, { useCallback, useState } from "react";
import { Grid } from "../grid";
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
import { useEditorState } from "../editor";

export function GridEditor({
  form_id,
  ...props
}: React.ComponentProps<typeof Grid> & {
  form_id: string;
}) {
  const [state, dispatch] = useEditorState();
  const [deleteFieldConfirmOpen, setDeleteFieldConfirmOpen] = useState(false);

  const { focus_field_id } = state;
  const openNewFieldPanel = useCallback(
    (field_id?: string) => {
      console.log("open new field panel", field_id);
      dispatch({
        type: "editor/field/edit",
        field_id: field_id,
        open: true,
        refresh: true,
      });
    },
    [dispatch]
  );

  const openDeleteFieldConfirm = () => {
    setDeleteFieldConfirmOpen(true);
  };

  const closeDeleteFieldConfirm = () => {
    setDeleteFieldConfirmOpen(false);
  };

  const supabase = createClientClient();

  const onDeleteField = useCallback(() => {
    supabase
      .from("form_field")
      .delete({
        count: "exact",
      })
      .eq("id", focus_field_id!)
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
  }, [supabase, focus_field_id]);

  return (
    <>
      <DeleteFieldConfirmDialog
        open={deleteFieldConfirmOpen}
        onOpenChange={setDeleteFieldConfirmOpen}
        onCancel={closeDeleteFieldConfirm}
        onDeleteConfirm={onDeleteField}
      />
      <Grid
        columns={props.columns}
        rows={props.rows}
        onAddNewFieldClick={openNewFieldPanel}
        onEditFieldClick={(field_id) => {
          openNewFieldPanel(field_id);
        }}
        onDeleteFieldClick={(field_id) => {
          dispatch({
            type: "editor/field/focus",
            field_id,
          });
          openDeleteFieldConfirm();
        }}
      />
    </>
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
