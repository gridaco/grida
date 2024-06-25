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
  CommitIcon,
  DownloadIcon,
  GearIcon,
  PieChartIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { format, startOfDay, addSeconds } from "date-fns";
import { format as formatTZ } from "date-fns-tz";
import { LOCALTZ, tztostr } from "../editor/symbols";
import { GridData } from "./grid-data";
import clsx from "clsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { XSupabaseQuery } from "@/lib/supabase-postgrest/builder";

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
    x_supabase_main_table,
    selected_rows: selected_responses,
  } = state;
  const supabase = createClientFormsClient();

  const { systemcolumns, columns } = useMemo(
    () => GridData.columns(datagrid_table, fields),
    [datagrid_table, fields]
  );

  // Transforming the responses into the format expected by react-data-grid
  const rows = useMemo(() => {
    return GridData.rows({
      table: datagrid_table,
      fields: fields,
      filter: datagrid_filter,
      responses: responses,
      sessions: sessions ?? [],
      // TODO:
      data: {
        pks: x_supabase_main_table?.pks ?? [],
        rows: x_supabase_main_table?.rows ?? [],
        fields: {},
      },
    });
  }, [
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
  const keyword = table_keyword(datagrid_table);
  const selectionDisabled = datagrid_table === "session";
  const readonly = datagrid_table === "session";

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 w-full">
        <div className="flex py-1 h-full justify-between gap-4">
          {has_selected_responses ? (
            <>
              <div
                className={clsx(
                  "px-4 flex items-center",
                  !has_selected_responses || selectionDisabled ? "hidden" : ""
                )}
              >
                <div className="flex gap-2 items-center">
                  <span
                    className="text-sm font-normal text-neutral-500"
                    aria-label="selected responses"
                  >
                    {txt_n_plural(selected_responses.size, keyword)} selected
                  </span>
                  <DeleteSelectedRowsButton />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-2 flex justify-center items-center">
                <Tabs
                  value={state.datagrid_table}
                  onValueChange={(value) => {
                    dispatch({
                      type: "editor/data-grid/table",
                      table: value as any,
                    });
                  }}
                >
                  <TabsList>
                    {state.tables.map((table) => {
                      return (
                        <TabsTrigger
                          key={table.type + table.name}
                          value={table.name}
                        >
                          {table.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              </div>
            </>
          )}
          <div
            className={clsx(
              "flex items-center",
              datagrid_table !== "session" && "hidden"
            )}
          >
            <span className="ms-2 text-xs text-muted-foreground">
              Displaying Responses & In-Progress Sessions
            </span>
          </div>
          <div className="flex-1" />
          <div className="px-4 flex gap-2 items-center">
            <Link href={`./analytics`} className="flex">
              <Badge variant={"outline"} className="cursor-pointer">
                <PieChartIcon className="align-middle me-2" />
                Realtime
              </Badge>
            </Link>
            <GridViewSettings />
          </div>
        </div>
      </header>
      <DeleteFieldConfirmDialog
        open={deleteFieldConfirmOpen}
        onOpenChange={setDeleteFieldConfirmOpen}
        onCancel={closeDeleteFieldConfirm}
        onDeleteConfirm={onDeleteField}
      />
      <div className="flex flex-col w-full h-full">
        <ResponseGrid
          systemcolumns={systemcolumns}
          columns={columns}
          rows={rows}
          readonly={readonly}
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
      </div>
      <footer className="flex gap-4 min-h-9 overflow-hidden items-center px-2 py-2 w-full border-t dark:border-t-neutral-700 divide-x">
        <div className="flex gap-2 items-center">
          <MaxRowsSelect />
          <span className="text-sm font-medium">
            {txt_n_plural(rows.length, keyword)}
          </span>
        </div>
        <Link href={`/v1/${form_id}/export/csv`} download target="_blank">
          <Button variant="ghost">
            Export to CSV
            <DownloadIcon />
          </Button>
        </Link>
      </footer>
    </div>
  );
}

function DeleteSelectedRowsButton() {
  const supabase = createClientFormsClient();
  const [state, dispatch] = useEditorState();

  const { datagrid_table, selected_rows } = state;

  const keyword = table_keyword(datagrid_table);

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

    const res = fetch(
      `/private/editor/connect/${state.form_id}/supabase/table/${state.connections!.supabase!.main_supabase_table_id}/query`,
      {
        method: "DELETE",
        body: JSON.stringify({
          filters: [
            {
              type: "in",
              column: state.x_supabase_main_table.gfpk,
              values: Array.from(selected_rows),
            },
          ],
        } satisfies XSupabaseQuery.Body),
      }
    ).then(() => {
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
          Delete {txt_n_plural(selected_rows.size, keyword)}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>
          Delete {txt_n_plural(selected_rows.size, keyword)}
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

function table_keyword(
  table: "response" | "session" | "x-supabase-main-table"
) {
  switch (table) {
    case "response":
      return "response";
    case "session":
      return "session";
    case "x-supabase-main-table":
      return "row";
  }
}

function GridViewSettings() {
  const [state, dispatch] = useEditorState();

  const starwarsday = useMemo(
    () => new Date(new Date().getFullYear(), 4, 4),
    []
  );

  const tzoffset = useMemo(
    () => s2Hmm(new Date().getTimezoneOffset() * -1 * 60),
    []
  );
  const tzoffset_scheduling_tz = useMemo(
    () =>
      state.scheduling_tz
        ? formatTZ(new Date(), "XXX", { timeZone: state.scheduling_tz })
        : undefined,
    [state.scheduling_tz]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center">
          <Badge variant="outline" className="cursor-pointer">
            <GearIcon />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Table Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={state.datagrid_filter.empty_data_hidden}
          onCheckedChange={(checked) => {
            dispatch({
              type: "editor/data-grid/filter",
              empty_data_hidden: checked,
            });
          }}
        >
          Hide records with empty data
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={state.datagrid_filter.masking_enabled}
          onCheckedChange={(checked) => {
            dispatch({
              type: "editor/data-grid/filter",
              masking_enabled: checked,
            });
          }}
        >
          Mask data
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={state.dateformat}
          onValueChange={(value) => {
            dispatch({
              type: "editor/data-grid/dateformat",
              dateformat: value as any,
            });
          }}
        >
          <DropdownMenuRadioItem value="date">
            Date
            <DropdownMenuShortcut>
              {starwarsday.toLocaleDateString()}
            </DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="time">
            Time
            <DropdownMenuShortcut>
              {starwarsday.toLocaleTimeString()}
            </DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="datetime">
            Date Time
            <DropdownMenuShortcut className="ms-4">
              {starwarsday.toLocaleString()}
            </DropdownMenuShortcut>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={tztostr(state.datetz, "browser")}
          onValueChange={(tz) => {
            switch (tz) {
              case "browser":
                dispatch({ type: "editor/data-grid/tz", tz: LOCALTZ });
                return;
              default:
                dispatch({ type: "editor/data-grid/tz", tz: tz });
                return;
            }
          }}
        >
          <DropdownMenuRadioItem value="browser">
            Local Time
            <DropdownMenuShortcut>(UTC+{tzoffset})</DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="UTC">
            UTC Time
            <DropdownMenuShortcut>(UTC+0)</DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            disabled={!state.scheduling_tz}
            value={state.scheduling_tz ?? "N/A"}
          >
            Scheduling Time
            {state.scheduling_tz && (
              <DropdownMenuShortcut className="text-end">
                {state.scheduling_tz}
                <br />
                (UTC{tzoffset_scheduling_tz})
              </DropdownMenuShortcut>
            )}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <Link href={`./simulator`} target="_blank">
          <DropdownMenuItem className="cursor-pointer">
            <CommitIcon className="inline align-middle me-2" />
            Open Simulator
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function s2Hmm(s: number) {
  const now = new Date();
  const startOfDayDate = startOfDay(now);
  const updatedDate = addSeconds(startOfDayDate, s);
  const formattedTime = format(updatedDate, "H:mm");

  return formattedTime;
}

function txt_n_plural(n: number | undefined, singular: string) {
  return (n || 0) > 1 ? `${n} ${singular}s` : `${n} ${singular}`;
}

function MaxRowsSelect() {
  const [state, dispatch] = useEditorState();

  return (
    <div>
      <Select
        value={state.datagrid_rows_per_page + ""}
        onValueChange={(value) => {
          dispatch({
            type: "editor/data-grid/rows",
            rows: parseInt(value),
          });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="rows" />
        </SelectTrigger>
        <SelectContent>
          <></>
          <SelectItem value={10 + ""}>10 rows</SelectItem>
          <SelectItem value={100 + ""}>100 rows</SelectItem>
          <SelectItem value={500 + ""}>500 rows</SelectItem>
          <SelectItem value={1000 + ""}>1000 rows</SelectItem>
        </SelectContent>
      </Select>
    </div>
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
