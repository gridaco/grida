"use client";

import React, { useCallback, useMemo } from "react";
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
import { useDatagridTable, useEditorState } from "../editor";
import Link from "next/link";
import {
  ChevronDownIcon,
  Cross2Icon,
  DownloadIcon,
  PieChartIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import clsx from "clsx";
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
import { editorlink } from "@/lib/forms/url";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import type { GFColumn, GFResponseRow, GFSystemColumn } from "../grid/types";
import { PrivateEditorApi } from "@/lib/private";
import { EditorSymbols } from "../editor/symbols";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3Icon, Rows3Icon } from "lucide-react";
import {
  useDatabaseTableId,
  useDatagridTableAttributes,
  useDatagridTableSpace,
} from "@/scaffolds/editor/use";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { TVirtualRow } from "../editor/state";
import { FormResponseField } from "@/types";

export function GridEditor({
  systemcolumns,
  columns,
  rows,
  readonly,
  selection,
  deletion,
}: {
  systemcolumns: GFSystemColumn[];
  columns: GFColumn[];
  rows?: GFResponseRow[];
  readonly?: boolean;
  selection: "on" | "off";
  deletion: "on" | "off";
}) {
  const supabase = useMemo(() => createClientFormsClient(), []);
  const [state, dispatch] = useEditorState();
  const { datagrid_isloading, datagrid_selected_rows } = state;

  const deleteFieldConfirmDialog = useDialogState<{ field_id: string }>();

  const tb = useDatagridTable();
  const table_id = useDatabaseTableId();
  const row_keyword = tb?.row_keyword ?? "row";
  const has_selected_rows = datagrid_selected_rows.size > 0;
  const selectionDisabled = selection !== "on";

  const onClearSelection = useCallback(() => {
    dispatch({
      type: "editor/response/select",
      selection: new Set(),
    });
  }, [dispatch]);

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

  const onDeleteField = useCallback(
    (field_id: string) => {
      if (!table_id) return;
      const deleting = supabase
        .from("form_field")
        .delete({
          count: "exact",
        })
        .eq("id", field_id)
        .then(({ error, count }) => {
          if (!count || error) {
            throw error;
          }
          dispatch({
            type: "editor/table/attribute/delete",
            table_id: table_id,
            field_id: field_id,
          });
        });

      toast.promise(deleting as Promise<any>, {
        loading: "Deleting...",
        success: "Field deleted",
        error: "Failed to delete field",
      });
    },
    [table_id, supabase, dispatch]
  );

  return (
    <GridLayout.Root>
      <DeleteFieldConfirmDialog
        open={deleteFieldConfirmDialog.open}
        onOpenChange={deleteFieldConfirmDialog.onOpenChange}
        onCancel={deleteFieldConfirmDialog.closeDialog}
        field_id={deleteFieldConfirmDialog.data?.field_id}
        onDeleteConfirm={(field_id) => onDeleteField(field_id)}
      />
      <GridLayout.Header>
        <GridLayout.HeaderMenus>
          {has_selected_rows ? (
            <div
              className={clsx(
                "flex items-center",
                !has_selected_rows || selectionDisabled ? "hidden" : ""
              )}
            >
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    className="w-7 h-7"
                    onClick={onClearSelection}
                  >
                    <Cross2Icon />
                  </Button>
                  <span
                    className="text-sm font-norma text-muted-foreground"
                    aria-label="selected responses"
                  >
                    {txt_n_plural(datagrid_selected_rows.size, row_keyword)}{" "}
                    selected
                  </span>
                </div>
                <GridLayout.HeaderSeparator />
                <SelectionExport />
                {deletion === "on" && (
                  <>
                    <GridLayout.HeaderSeparator />
                    <DeleteSelectedRowsButton
                      disabled={readonly}
                      className={readonly ? "cursor-not-allowed" : ""}
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center items-center divide-x *:px-2 first:*:pl-0 last:*:pr-0">
                <TableViews />
                <TableQuery />
              </div>
            </>
          )}
        </GridLayout.HeaderMenus>
        <GridLayout.HeaderMenus>
          {state.doctype === "v0_form" && (
            <Link
              href={editorlink("data/analytics", {
                basepath: state.basepath,
                document_id: state.document_id,
              })}
              className="flex"
            >
              <Badge variant={"outline"} className="cursor-pointer">
                <PieChartIcon className="align-middle me-2" />
                Realtime
              </Badge>
            </Link>
          )}
          <GridViewSettings />
          {!tb?.readonly && <TableMod />}
        </GridLayout.HeaderMenus>
      </GridLayout.Header>
      <GridLayout.Content>
        <ResponseGrid
          systemcolumns={systemcolumns}
          columns={columns}
          rows={rows ?? []}
          readonly={readonly}
          loading={datagrid_isloading}
          selectionDisabled={selectionDisabled}
          onAddNewFieldClick={openNewFieldPanel}
          onEditFieldClick={openEditFieldPanel}
          onDeleteFieldClick={(field_id) => {
            deleteFieldConfirmDialog.openDialog({ field_id });
          }}
          onCellChange={(row, column, data) => {
            dispatch({
              type: "editor/data-grid/cell/change",
              table_id: table_id!,
              row: row.__gf_id,
              column: column,
              data: data,
            });
          }}
        />
      </GridLayout.Content>
      <GridLayout.Footer>
        <div className="flex gap-4 items-center">
          <GridLimit />
          <GridCount count={rows?.length} keyword={row_keyword} />
        </div>
        <GridLayout.FooterSeparator />
        <GridRefresh />
        {state.doctype === "v0_form" && tb?.provider === "grida" && (
          <>
            <GridLayout.FooterSeparator />
            <GridaFormsResponsesExportCSV />
          </>
        )}
      </GridLayout.Footer>
    </GridLayout.Root>
  );
}

function SelectionExport() {
  const [state] = useEditorState();

  const { datagrid_selected_rows } = state;
  const tb = useDatagridTable();
  const space = useDatagridTableSpace();
  const attributes = useDatagridTableAttributes();

  const onExportCSV = useCallback(() => {
    //
    // TODO: does not work with pgjsonpath
    //

    if (!tb || !attributes || !space || !space.stream) {
      toast.error("Something went wrong. Please refresh the page.");
      return;
    }

    // BOM for CJK characters in file content
    const BOM = "\uFEFF";
    let csvtxt = "";

    const columns = [...attributes]
      .sort((a, b) => a.local_index - b.local_index)
      .map((attr) => {
        return {
          id: attr.id,
          name: attr.name,
          type: attr.type,
        };
      });

    const headers = columns.map((col) => col.name);

    const csvstrfycell = (cell: any) => {
      if (cell === null || cell === undefined) {
        return "";
      }
      if (typeof cell === "object") {
        return JSON.stringify(cell);
      }
      return cell;
    };

    switch (space.provider) {
      case "custom":
        toast.error("Export to CSV is not supported for this table");
        return;
      case "grida": {
        const rows = space.stream
          .filter((row) => datagrid_selected_rows.has(row.id))
          .map((row) => {
            // [col0, col1, col2, col3] by col.id
            return columns.map((col) => {
              const cell = row.data[col.id].value;
              return csvstrfycell(cell);
            });
          });

        // csvtxt
        csvtxt = Papa.unparse([headers, ...rows], {
          header: true,
        });
        break;
      }
      case "x-supabase": {
        if (
          !(
            "x_sb_main_table_connection" in tb &&
            !!tb.x_sb_main_table_connection.pk
          )
        ) {
          toast.error("Export to CSV is not supported for this table");
          return;
        }

        const rows = space.stream
          .filter((row) =>
            datagrid_selected_rows.has(row[tb.x_sb_main_table_connection.pk!])
          )
          .map((row) => {
            // [col0, col1, col2, col3] by col.id
            return columns.map((col) => {
              const cell = row[col.name];
              return csvstrfycell(cell);
            });
          });

        // csvtxt
        csvtxt = Papa.unparse([headers, ...rows], {
          header: true,
        });
        break;
      }
    }

    saveAs(
      new Blob([BOM + csvtxt], { type: "text/csv;charset=utf-8" }),
      `${tb.name}.csv`
    );
  }, [datagrid_selected_rows, tb?.id, attributes, space?.stream]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm">
          <DownloadIcon className="w-4 h-4 align-middle inline-flex me-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem onClick={onExportCSV}>Export to CSV</DropdownMenuItem>
        <DropdownMenuItem disabled>
          Export to JSON
          <Badge variant="outline" className="ms-2">
            soon
          </Badge>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GridaFormsResponsesExportCSV() {
  const table_id = useDatabaseTableId();

  return (
    <Link
      href={`/v1/${table_id}/export/csv`}
      download
      target="_blank"
      prefetch={false}
    >
      <Button variant="outline" size="sm">
        <DownloadIcon className="w-4 h-4 align-middle inline-flex me-2" />
        Export to CSV
      </Button>
    </Link>
  );
}

function TableQuery() {
  const [state] = useEditorState();
  // const { datagrid_table_id } = state;
  const tb = useDatagridTable();

  if (!tb) return <></>;

  return (
    <div className="flex items-center gap-1">
      <GridLocalSearch />
      {"x_sb_main_table_connection" in tb && <XSupaDataGridSort />}
    </div>
  );
}

function TableMod() {
  const [state, dispatch] = useEditorState();

  const openNewTuplePanel = useCallback(() => {
    dispatch({
      type: "editor/responses/edit",
      open: true,
      response_id: undefined,
      refresh: true,
    });
  }, [dispatch]);

  const openNewAttributePanel = useCallback(() => {
    dispatch({
      type: "editor/field/edit",
      open: true,
      refresh: true,
    });
  }, [dispatch]);

  return (
    <div className="flex items-center gap-1">
      <div role="group" className="inline-flex rounded-md shadow-sm">
        <button
          type="button"
          onClick={openNewTuplePanel}
          className={clsx(
            buttonVariants({ variant: "default", size: "sm" }),
            "border rounded-s-lg rounded-e-none focus:z-10 focus:ring-2",
            "gap-2"
          )}
        >
          New
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={clsx(
                buttonVariants({ variant: "default", size: "sm" }),
                "pl-1.5 pr-1.5 py-1 border-t border-b border-r rounded-s-none rounded-e-lg focus:z-10 focus:ring-2"
              )}
            >
              <ChevronDownIcon />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            <DropdownMenuItem onSelect={openNewTuplePanel}>
              <Rows3Icon className="w-4 h-4 align-middle me-2" />
              Insert Row
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openNewAttributePanel}>
              <Columns3Icon className="w-4 h-4 align-middle me-2" />
              Insert Column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function useDeleteSelectedSchemaTableRows() {
  const [state, dispatch] = useEditorState();
  const supabase = createClientFormsClient();
  const { datagrid_selected_rows } = state;
  return useCallback(() => {
    const deleting = supabase
      .from("response")
      .delete()
      .in("id", Array.from(datagrid_selected_rows))
      .then(() => {
        dispatch({
          type: "editor/data-grid/delete/selected",
        });
      });

    toast.promise(deleting as Promise<any>, {
      loading: `Deleting...`,
      success: "Deleted",
      error: "", // this won't be shown (supabase does not return error for delete operation)
    });
  }, [supabase, datagrid_selected_rows, dispatch]);
}

function DeleteSelectedRowsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [state, dispatch] = useEditorState();

  const tb = useDatagridTable();
  const { datagrid_table_id, datagrid_selected_rows } = state;
  const { row_keyword } = useDatagridTable() || { row_keyword: "row" };

  const delete_selected_rows = useDeleteSelectedSchemaTableRows();

  const delete_selected_x_supabase_main_table_rows = useCallback(() => {
    if (
      tb?.id !== EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
    ) {
      toast.error("Something went wrong. Please refresh the page.");
      return;
    }

    if (!tb.x_sb_main_table_connection.pk) {
      toast.error("Cannot delete rows without a primary key");
      return;
    }

    const res = PrivateEditorApi.SupabaseQuery.qdelete({
      form_id: state.form.form_id,
      main_table_id: state.connections!.supabase!.main_supabase_table_id!,
      filters: [
        {
          type: "in",
          column: tb.x_sb_main_table_connection.pk,
          values: Array.from(datagrid_selected_rows),
        },
      ],
    }).then(({ data: { error, count } }) => {
      if (error || !count) {
        console.error("Failed to delete rows", error);
        throw error;
      }
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
    tb,
    state.form.form_id,
    state.connections,
    datagrid_selected_rows,
    dispatch,
  ]);

  const onDeleteSelection = useCallback(() => {
    switch (datagrid_table_id) {
      case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID:
        delete_selected_rows();
        break;
      case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID:
        toast.error("Cannot delete sessions");
        break;
      case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID:
        delete_selected_x_supabase_main_table_rows();
        break;
      default:
        delete_selected_rows();
        break;
    }
  }, [
    datagrid_table_id,
    delete_selected_rows,
    delete_selected_x_supabase_main_table_rows,
  ]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" {...props} className={className}>
          <TrashIcon />
          Delete {txt_n_plural(datagrid_selected_rows.size, row_keyword)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>
          Delete {txt_n_plural(datagrid_selected_rows.size, row_keyword)}
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
  field_id,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  field_id?: string;
  onCancel: () => void;
  onDeleteConfirm: (field_id: string) => void;
}) {
  const [state] = useEditorState();

  const { datagrid_table_id } = state;

  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete Field</AlertDialogTitle>
        <AlertDialogDescription>
          {datagrid_table_id ===
          EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID ? (
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
          <AlertDialogAction
            disabled={!field_id}
            onClick={() => onDeleteConfirm(field_id!)}
          >
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
