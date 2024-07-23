"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ResponseGrid } from "../grid";
import { createClientFormsClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import toast from "react-hot-toast";
import { useEditorState } from "../editor";
import Link from "next/link";
import {
  DownloadIcon,
  PieChartIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { GridData } from "./grid-data";
import clsx from "clsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { XSupabaseQuery } from "@/lib/supabase-postgrest/builder";
import { SupabaseLogo } from "@/components/logos";
import {
  GridLimit,
  GridViewSettings,
  GridRefresh,
  XSupaDataGridSort,
  GridLocalSearch,
  GridCount,
  TableViews,
} from "./components";
import * as GridLayout from "./components/layout";
import { txt_n_plural } from "@/utils/plural";

export function GridEditor() {
  const [state, dispatch] = useEditorState();
  const [deleteFieldConfirmOpen, setDeleteFieldConfirmOpen] = useState(false);

  const {
    form_id,
    focus_field_id,
    fields,
    responses,
    sessions,
    datagrid_filter,
    datagrid_table,
    datagrid_table_row_keyword,
    x_supabase_main_table,
    selected_rows: selected_responses,
  } = state;
  const supabase = createClientFormsClient();

  const { systemcolumns, columns } = useMemo(
    () => GridData.columns(datagrid_table, fields),
    [datagrid_table, fields]
  );

  // Transforming the responses into the format expected by react-data-grid
  const { filtered, inputlength } = useMemo(() => {
    return GridData.rows({
      form_id: form_id,
      table: datagrid_table as "response" | "session" | "x-supabase-main-table",
      fields: fields,
      filter: datagrid_filter,
      responses: responses,
      sessions: sessions ?? [],
      data: {
        pks: x_supabase_main_table?.pks ?? [],
        rows: x_supabase_main_table?.rows ?? [],
      },
    });
  }, [
    form_id,
    datagrid_table,
    sessions,
    fields,
    responses,
    x_supabase_main_table,
    datagrid_filter,
  ]);

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
    const deleting = supabase
      .from("form_field")
      .delete({
        count: "exact",
      })
      .eq("id", focus_field_id!)
      .then(({ error, count }) => {
        if (!count || error) {
          throw error;
        }
        dispatch({
          type: "editor/field/delete",
          field_id: focus_field_id!,
        });
      });

    toast.promise(deleting as Promise<any>, {
      loading: "Deleting...",
      success: "Field deleted",
      error: "Failed to delete field",
    });
  }, [supabase, focus_field_id, dispatch]);

  const has_selected_responses = selected_responses.size > 0;
  const selectionDisabled = datagrid_table === "session";
  const readonly = datagrid_table === "session";

  return (
    <GridLayout.Root>
      <GridLayout.Header>
        <GridLayout.HeaderMenus>
          {has_selected_responses ? (
            <div
              className={clsx(
                "flex items-center",
                !has_selected_responses || selectionDisabled ? "hidden" : ""
              )}
            >
              <div className="flex gap-2 items-center">
                <span
                  className="text-sm font-normal text-neutral-500"
                  aria-label="selected responses"
                >
                  {txt_n_plural(
                    selected_responses.size,
                    datagrid_table_row_keyword
                  )}{" "}
                  selected
                </span>
                <DeleteSelectedRowsButton />
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center items-center divide-x *:px-2 first:*:pl-0 last:*:pr-0">
                <TableViews />
                {/* <div className="border-r"/> */}
                <TableTools />
              </div>
            </>
          )}
        </GridLayout.HeaderMenus>
        <GridLayout.HeaderMenus>
          <Link href={`./analytics`} className="flex">
            <Badge variant={"outline"} className="cursor-pointer">
              <PieChartIcon className="align-middle me-2" />
              Realtime
            </Badge>
          </Link>
          <GridViewSettings />
        </GridLayout.HeaderMenus>
      </GridLayout.Header>
      <DeleteFieldConfirmDialog
        open={deleteFieldConfirmOpen}
        onOpenChange={setDeleteFieldConfirmOpen}
        onCancel={closeDeleteFieldConfirm}
        onDeleteConfirm={onDeleteField}
      />
      <GridLayout.Content>
        <ResponseGrid
          systemcolumns={systemcolumns}
          columns={columns}
          rows={filtered}
          readonly={readonly}
          loading={inputlength === 0}
          selectionDisabled={selectionDisabled}
          onAddNewFieldClick={openNewFieldPanel}
          onEditFieldClick={openEditFieldPanel}
          onDeleteFieldClick={(field_id) => {
            dispatch({
              type: "editor/field/focus",
              field_id,
            });
            openDeleteFieldConfirm();
          }}
          onCellChange={(row, column, data) => {
            dispatch({
              type: "editor/data-grid/cell/change",
              row: row.__gf_id,
              column: column,
              data: data,
            });
          }}
        />
      </GridLayout.Content>
      <GridLayout.Footer>
        <div className="flex gap-2 items-center">
          <GridLimit />
          <GridCount count={filtered?.length ?? 0} />
        </div>
        <Link href={`/v1/${form_id}/export/csv`} download target="_blank">
          <Button variant="ghost">
            Export to CSV
            <DownloadIcon />
          </Button>
        </Link>
        <GridRefresh />
      </GridLayout.Footer>
    </GridLayout.Root>
  );
}

function TableTools() {
  const [state] = useEditorState();
  const { datagrid_table } = state;

  return (
    <div className="flex items-center gap-1">
      <GridLocalSearch />
      {datagrid_table === "x-supabase-main-table" && <XSupaDataGridSort />}
    </div>
  );
}

async function xsupabase_delete_query({
  form_id,
  main_table_id,
  column,
  values,
}: {
  form_id: string;
  main_table_id: number;
  column: string;
  values: any[];
}) {
  const res = await fetch(
    `/private/editor/connect/${form_id}/supabase/table/${main_table_id}/query`,
    {
      method: "DELETE",
      body: JSON.stringify({
        filters: [
          {
            type: "in",
            column: column,
            values: values,
          },
        ],
      } satisfies XSupabaseQuery.Body),
    }
  );

  const { error, count } = await res.json();

  if (error || !count) {
    console.error("Failed to delete rows", error);
    throw error;
  }

  return true;
}

function DeleteSelectedRowsButton() {
  const supabase = createClientFormsClient();
  const [state, dispatch] = useEditorState();

  const { datagrid_table, selected_rows, datagrid_table_row_keyword } = state;

  const delete_selected_responses = useCallback(() => {
    const deleting = supabase
      .from("response")
      .delete()
      .in("id", Array.from(selected_rows))
      .then(() => {
        dispatch({
          type: "editor/data-grid/delete/selected",
        });
      });

    toast.promise(deleting as Promise<any>, {
      loading: "Deleting response...",
      success: "Response deleted",
      error: "", // this won't be shown (supabase does not return error for delete operation)
    });
  }, [supabase, selected_rows, dispatch]);

  const delete_selected_x_supabase_main_table_rows = useCallback(() => {
    if (!state.x_supabase_main_table?.gfpk) {
      toast.error("Cannot delete rows without a primary key");
      return;
    }

    const res = xsupabase_delete_query({
      form_id: state.form_id,
      main_table_id: state.connections!.supabase!.main_supabase_table_id!,
      column: state.x_supabase_main_table.gfpk,
      values: Array.from(selected_rows),
    }).then(() => {
      dispatch({
        type: "editor/data-grid/delete/selected",
      });
    });

    toast.promise(res, {
      loading: "Deleting...",
      success: "Deleted",
      error: "Failed",
    });
  }, [
    state.form_id,
    state.connections,
    state.x_supabase_main_table?.gfpk,
    selected_rows,
    dispatch,
  ]);

  const onDeleteSelection = useCallback(() => {
    switch (datagrid_table) {
      case "response":
        delete_selected_responses();
        break;
      case "session":
        toast.error("Cannot delete sessions");
        break;
      case "x-supabase-main-table":
        delete_selected_x_supabase_main_table_rows();
        break;
    }
  }, [
    datagrid_table,
    delete_selected_responses,
    delete_selected_x_supabase_main_table_rows,
  ]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="flex items-center gap-1 p-2 rounded-md border text-sm">
          <TrashIcon />
          Delete {txt_n_plural(selected_rows.size, datagrid_table_row_keyword)}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>
          Delete {txt_n_plural(selected_rows.size, datagrid_table_row_keyword)}
        </AlertDialogTitle>
        <AlertDialogDescription>
          Deleting this record will remove all data associated with it. Are you
          sure you want to delete this record?
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 p-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={onDeleteSelection}
          >
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
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
  const [state] = useEditorState();

  const { datagrid_table } = state;

  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete Field</AlertDialogTitle>
        <AlertDialogDescription>
          {datagrid_table === "x-supabase-main-table" ? (
            <>
              Deleting this field will remove all data associated with it
              (within Grida Forms). Are you sure you want to delete this field?
              <br />
              <strong>
                Your supabase column stays untouched. - We do not have
                permission to do that.
              </strong>
            </>
          ) : (
            <>
              Deleting this field will remove all data associated with it. Are
              you sure you want to delete this field?
            </>
          )}
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
