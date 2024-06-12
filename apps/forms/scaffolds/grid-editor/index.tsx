"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Grid } from "../grid";
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
import { fmt_local_index } from "@/utils/fmt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FormFieldDefinition,
  FormResponse,
  FormResponseField,
  FormResponseSession,
} from "@/types";
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
import { Button } from "@/components/ui/button";
import clsx from "clsx";
import type { GFRow } from "../grid/types";
import { format, startOfDay, addSeconds } from "date-fns";
import { format as formatTZ } from "date-fns-tz";
import { LOCALTZ, tztostr } from "../editor/symbols";

function rows_from_responses(responses?: FormResponse[]) {
  return (
    responses?.map((response, index) => {
      const row: GFRow = {
        __gf_id: response.id,
        __gf_display_id: fmt_local_index(response.local_index),
        __gf_created_at: response.created_at,
        __gf_customer_uuid: response.customer_id,
      }; // react-data-grid expects each row to have a unique 'id' property
      response?.fields?.forEach((field: FormResponseField) => {
        row[field.form_field_id] = {
          type: field.type,
          value: field.value,
          storage_object_paths: field.storage_object_paths,
        };
      });
      return row;
    }) ?? []
  );
}

function rows_from_sessions(
  sessions: FormResponseSession[],
  fields: FormFieldDefinition[]
) {
  return (
    sessions?.map((session, index) => {
      const row: GFRow = {
        __gf_id: session.id,
        __gf_display_id: session.id,
        __gf_created_at: session.created_at,
        __gf_customer_uuid: session.customer_id,
      }; // react-data-grid expects each row to have a unique 'id' property
      Object.entries(session.raw || {}).forEach(([key, value]) => {
        const field = fields.find((f) => f.id === key);
        row[key] = {
          value: value,
          type: field?.type,
        };
      });
      return row;
    }) ?? []
  );
}

export function GridEditor() {
  const [state, dispatch] = useEditorState();
  const [deleteFieldConfirmOpen, setDeleteFieldConfirmOpen] = useState(false);

  const {
    form_id,
    focus_field_id,
    fields,
    responses,
    sessions,
    datagrid_table,
    selected_responses,
  } = state;
  const supabase = createClientFormsClient();

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
    switch (datagrid_table) {
      case "response":
        return rows_from_responses(responses);
      case "session":
        return sessions ? rows_from_sessions(sessions, state.fields) : [];
    }
    // TODO: need to update dpes with fields
  }, [datagrid_table, sessions, state.fields, responses]);

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
  const keyword = table_keyword(datagrid_table);
  const selectionDisabled = datagrid_table !== "response"; // TODO: session does not support selection
  const readonly = datagrid_table !== "response";

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 w-full">
        <div className="flex px-4 py-1 h-full justify-between gap-4">
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
                {txt_n_plural(selected_responses.size, keyword)} selected
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-1 p-2 rounded-md border text-sm">
                    <TrashIcon />
                    Delete {txt_n_plural(selected_responses.size, keyword)}
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
            </div>
          </div>
          <div
            className={clsx(
              "flex items-center",
              datagrid_table !== "session" && "hidden"
            )}
          >
            <h2 className="text-lg font-bold">Sessions</h2>
            <span className="ms-2 text-xs text-muted-foreground">
              Displaying Responses & In-Progress Sessions
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2 items-center">
            <Link href={`./analytics`}>
              <Badge variant={"outline"} className="cursor-pointer">
                Realtime
                <PieChartIcon className="align-middle ms-2" />
              </Badge>
            </Link>
            <Link href={`./simulator`} target="_blank">
              <Badge variant={"outline"} className="cursor-pointer">
                Simulator
                <CommitIcon className="align-middle ms-2" />
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
        <Grid
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

function table_keyword(table: "response" | "session") {
  switch (table) {
    case "response":
      return "response";
    case "session":
      return "session";
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
        <DropdownMenuLabel>Grid Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={state.datagrid_table === "session"}
          onCheckedChange={(checked) => {
            dispatch({
              type: "editor/data-grid/table",
              table: checked ? "session" : "response",
            });
          }}
        >
          Display Sessions
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
  return (n || 0) > 1 ? `${n} ${singular}s` : `1 ${singular}`;
}

function MaxRowsSelect() {
  const [state, dispatch] = useEditorState();

  return (
    <div>
      <Select
        value={state.responses_pagination_rows + ""}
        onValueChange={(value) => {
          dispatch({
            type: "editor/responses/pagination/rows",
            max: parseInt(value),
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
