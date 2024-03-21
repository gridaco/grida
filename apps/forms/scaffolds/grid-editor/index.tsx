"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Grid } from "../grid";
import { createClientClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@editor-ui/alert-dialog";
import toast from "react-hot-toast";
import { useEditorState } from "../editor";
import Link from "next/link";
import { DownloadIcon, TrashIcon } from "@radix-ui/react-icons";

export function GridEditor() {
  const [state, dispatch] = useEditorState();
  const [deleteFieldConfirmOpen, setDeleteFieldConfirmOpen] = useState(false);

  const { form_id, focus_field_id, fields, responses, selected_responses } =
    state;
  const supabase = createClientClient();

  const columns = useMemo(
    () =>
      fields?.map((field) => ({
        key: field.id,
        name: field.name,
        frozen: false,
        type: field.type,
        // You can add more properties here as needed by react-data-grid
      })) ?? [],
    [fields]
  );

  // Transforming the responses into the format expected by react-data-grid
  const rows = useMemo(() => {
    return (
      responses?.map((response, index) => {
        const row: any = {
          __gf_id: response.id,
          __gf_created_at: response.created_at,
        }; // react-data-grid expects each row to have a unique 'id' property
        response.fields.forEach((field: any) => {
          row[field.form_field_id] = {
            type: field.type,
            value: field.value,
          };
        });
        return row;
      }) ?? []
    );
    // TODO: need to update dpes with fields
  }, [responses]);

  const openNewFieldPanel = useCallback(() => {
    dispatch({
      type: "editor/field/edit",
      open: true,
      refresh: true,
    });
  }, [dispatch]);

  const openEditFieldPanel = useCallback(
    (field_id?: string) => {
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

  const onDeleteField = useCallback(() => {
    supabase
      .from("form_field")
      .delete({
        count: "exact",
      })
      .eq("id", focus_field_id!)
      .then(({ error, count }) => {
        if (!count) {
          toast.error("Failed to delete field");
          return;
        }
        if (error) {
          toast.error("Failed to delete field");
          console.error(error);
          return;
        }
        toast.success("Field deleted");
        dispatch({
          type: "editor/field/delete",
          field_id: focus_field_id!,
        });
      });
  }, [supabase, focus_field_id, dispatch]);

  const onDeleteResponse = useCallback(() => {
    const deleting = supabase
      .from("response")
      .delete()
      .in("id", Array.from(selected_responses))
      .then(() => {
        dispatch({
          type: "editor/response/delete/selected",
        });
      });

    toast.promise(deleting as Promise<any>, {
      loading: "Deleting response...",
      success: "Response deleted",
      error: "", // this won't be shown (supabase does not return error for delete operation)
    });
  }, [supabase, selected_responses, dispatch]);

  const has_selected_responses = selected_responses.size > 0;

  return (
    <div className="h-full flex flex-col flex-1 w-full overflow-x-hidden">
      <header className="flex h-12 px-2 py-1 items-center w-full gap-4">
        {has_selected_responses && (
          <span
            className="text-sm font-normal text-neutral-500"
            aria-label="selected responses"
          >
            {txt_n_responses(selected_responses.size)} selected
          </span>
        )}
        {has_selected_responses ? (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-1 p-2 rounded-md border text-sm">
                  <TrashIcon />
                  Delete {txt_n_responses(selected_responses.size)}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Delete Response</AlertDialogTitle>
                <AlertDialogDescription>
                  Deleting this response will remove all data associated with
                  it. Are you sure you want to delete this response?
                </AlertDialogDescription>
                <div className="flex justify-end gap-2 p-2">
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDeleteResponse}>
                    Delete
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <div>
              <button className="flex items-center gap-1 p-2 rounded-md border text-sm">
                Insert
              </button>
            </div>
          </>
        )}
      </header>
      <div className="flex flex-col h-full w-full">
        <DeleteFieldConfirmDialog
          open={deleteFieldConfirmOpen}
          onOpenChange={setDeleteFieldConfirmOpen}
          onCancel={closeDeleteFieldConfirm}
          onDeleteConfirm={onDeleteField}
        />
        <Grid
          columns={columns}
          rows={rows}
          onAddNewFieldClick={openNewFieldPanel}
          onEditFieldClick={openEditFieldPanel}
          onDeleteFieldClick={(field_id) => {
            dispatch({
              type: "editor/field/focus",
              field_id,
            });
            openDeleteFieldConfirm();
          }}
        />
      </div>
      <footer className="flex min-h-9 overflow-hidden items-center px-2 w-full border-t">
        <MaxRowsSelect />
        <div>{txt_n_responses(state.responses?.length ?? 0)}</div>
        <Link href={`/v1/${form_id}/export/csv`} download target="_blank">
          <button className="flex items-center gap-1 p-2 bg-neutral-100 rounded">
            Export to CSV
            <DownloadIcon />
          </button>
        </Link>
      </footer>
    </div>
  );
}

function txt_n_responses(n: number) {
  return n === 1 ? "1 response" : `${n} responses`;
}

function MaxRowsSelect() {
  const [state, dispatch] = useEditorState();

  return (
    <select
      className="p-2 bg-neutral-100 rounded"
      value={state.responses_pagination_rows}
      onChange={(e) => {
        dispatch({
          type: "editor/responses/pagination/rows",
          max: parseInt(e.target.value),
        });
      }}
    >
      <option label="10 rows" value={10} />
      <option label="100 rows" value={100} />
      <option label="500 rows" value={500} />
      <option label="1000 rows" value={1000} />
    </select>
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
