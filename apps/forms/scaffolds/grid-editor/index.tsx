"use client";

import React, { useCallback, useMemo } from "react";
import { DataGrid, type DataGridCellSelectionCursor } from "../grid";
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
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import clsx from "clsx";
import {
  TableViews,
  GridQueryLimitSelect,
  GridViewSettings,
  GridRefreshButton,
  DataQueryTextSearch,
  GridQueryCount,
  GridQueryPaginationControl,
} from "./components";
import * as GridLayout from "./components/layout";
import { txt_n_plural } from "@/utils/plural";
import { editorlink } from "@/lib/forms/url";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import type { DGColumn, DGResponseRow, DGSystemColumn } from "../grid/types";
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
  useDataGridTextSearch,
  useDataGridQuery,
  useDataGridRefresh,
  useDatagridTableAttributes,
  useDatagridTableSpace,
} from "@/scaffolds/editor/use";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { Gallery } from "../data-view-gallery/gallery";
import {
  DataQueryPredicatesMenu,
  DataQueryPredicateChip,
  DataQueryPrediateAddMenu,
  DataQueryOrderByMenu,
  DataQueryOrderbyChip,
} from "./components/query";
import {
  DataQueryPredicatesMenuTriggerButton,
  DataQueryOrderbyMenuTriggerButton,
} from "./components/ui/toggle";
import { Chartview } from "../data-view-chart/chartview";
import { useMultiplayer } from "@/scaffolds/editor/multiplayer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { SchemaNameProvider, TableDefinitionProvider } from "../data-query";
import { GridFileStorageQueueProvider } from "../grid/providers";
import { XSBTextSearchInput } from "./components/query/xsb/xsb-text-search";
import { LoadingProgress } from "@/components/extension/loading-progress";
import { motion } from "framer-motion";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

function useSelectedCells(): DataGridCellSelectionCursor[] {
  const [state] = useEditorState();
  const [multplayer] = useMultiplayer();

  return useMemo(() => {
    const cellcursors: DataGridCellSelectionCursor[] = multplayer.cursors
      .filter((c) => c.node?.type === "cell")
      .map((cursor) => {
        return {
          color: cursor.palette[400],
          cursor_id: cursor.cursor_id,
          pk: cursor.node!.pos?.pk,
          column: cursor.node!.pos.column,
        };
      });

    if (state.datagrid_selected_cell) {
      cellcursors.push({
        ...state.datagrid_selected_cell,
        color: "current", // in datagrid we don't use cursor color for local cursor
        cursor_id: multplayer.player.cursor_id,
      });
    }

    return cellcursors;
  }, [
    multplayer.cursors,
    multplayer.player.cursor_id,
    state.datagrid_selected_cell,
  ]);
}

export function GridEditor({
  systemcolumns,
  columns,
  rows,
  readonly,
  selection,
  deletion,
}: {
  systemcolumns: DGSystemColumn[];
  columns: DGColumn[];
  rows?: DGResponseRow[];
  readonly?: boolean;
  selection: "on" | "off";
  deletion: "on" | "off";
}) {
  const supabase = useMemo(() => createClientFormsClient(), []);
  const [state, dispatch] = useEditorState();

  const query = useDataGridQuery();
  const { isPredicatesSet, isOrderbySet, isTextSearchSet, isTextSearchValid } =
    query;
  const is_query_orderby_or_predicates_set = isPredicatesSet || isOrderbySet;

  const hasPredicates =
    isPredicatesSet || (isTextSearchSet && isTextSearchValid);

  const { datagrid_isloading, datagrid_selected_rows } = state;

  const deleteFieldConfirmDialog = useDialogState<{ field_id: string }>();

  const tb = useDatagridTable();
  const table_id = useDatabaseTableId();
  const refresh = useDataGridRefresh();
  const row_keyword = tb?.row_keyword ?? "row";
  const has_selected_rows = datagrid_selected_rows.size > 0;
  const selectionDisabled = selection !== "on";
  const count = state.datagrid_query_estimated_count;

  const onClearSelection = useCallback(() => {
    dispatch({
      type: "editor/table/space/rows/select",
      selection: new Set(),
    });
  }, [dispatch]);

  const openNewFieldPanel = useCallback(() => {
    dispatch({
      type: "editor/panels/field-edit",
      open: true,
      refresh: true,
    });
  }, [dispatch]);

  const openEditFieldPanel = useCallback(
    (field_id?: string) => {
      dispatch({
        type: "editor/panels/field-edit",
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
        .from("attribute")
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

  const selectedCells = useSelectedCells();

  const definition = useMemo(() => {
    return tb
      ? "x_sb_main_table_connection" in tb
        ? SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
            tb.x_sb_main_table_connection.sb_table_schema
          )
        : null
      : null;
  }, [tb]);

  return (
    <SchemaNameProvider
      schema={
        tb
          ? "x_sb_main_table_connection" in tb
            ? tb.x_sb_main_table_connection.sb_schema_name
            : undefined
          : undefined
      }
    >
      <TableDefinitionProvider definition={definition}>
        <GridLayout.Root>
          <DeleteFieldConfirmDialog
            open={deleteFieldConfirmDialog.open}
            onOpenChange={deleteFieldConfirmDialog.onOpenChange}
            onCancel={deleteFieldConfirmDialog.closeDialog}
            field_id={deleteFieldConfirmDialog.data?.field_id}
            onDeleteConfirm={(field_id) => onDeleteField(field_id)}
          />
          <GridLayout.Header>
            <GridLayout.HeaderLine>
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
                          {txt_n_plural(
                            datagrid_selected_rows.size,
                            row_keyword
                          )}{" "}
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
                      <TableQueryToggles />
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
            </GridLayout.HeaderLine>
            {is_query_orderby_or_predicates_set && (
              <GridLayout.HeaderLine className="border-b-0 px-0">
                <ScrollArea>
                  <ScrollBar orientation="horizontal" className="invisible" />
                  <div className="px-2">
                    <TableQueryChips />
                  </div>
                </ScrollArea>
              </GridLayout.HeaderLine>
            )}

            <motion.div
              className="relative w-full"
              initial={{ opacity: 0 }}
              animate={datagrid_isloading ? "visible" : "hidden"}
              variants={{
                hidden: { opacity: 0, transition: { duration: 0.8 } },
                visible: { opacity: 1, transition: { duration: 0.15 } },
              }}
            >
              <LoadingProgress className="absolute bottom-0 left-0 right-0 rounded-none h-0.5 w-full" />
            </motion.div>
          </GridLayout.Header>
          <GridFileStorageQueueProvider
            table_id={table_id!}
            supabase_table_id={
              "x_sb_main_table_connection" in tb!
                ? tb.x_sb_main_table_connection.sb_table_id
                : null
            }
          >
            {tb?.view === "gallery" && (
              <GridLayout.Content className="overflow-y-scroll">
                <Gallery columns={columns} rows={rows ?? []} />
              </GridLayout.Content>
            )}
            {tb?.view === "chart" && (
              <GridLayout.Content className="overflow-y-scroll">
                <Chartview />
              </GridLayout.Content>
            )}
            {tb?.view === "list" && (
              <GridLayout.Content className="overflow-y-scroll">
                {/* <Chartview /> */}
              </GridLayout.Content>
            )}
            {tb?.view === "table" && (
              <GridLayout.Content>
                <DataGrid
                  className="bg-transparent"
                  local_cursor_id={state.cursor_id}
                  systemcolumns={systemcolumns}
                  columns={columns}
                  rows={rows ?? []}
                  readonly={readonly}
                  loading={datagrid_isloading}
                  hasPredicates={hasPredicates}
                  selectionDisabled={selectionDisabled}
                  onAddNewFieldClick={openNewFieldPanel}
                  onEditFieldClick={openEditFieldPanel}
                  onDeleteFieldClick={(field_id) => {
                    deleteFieldConfirmDialog.openDialog({ field_id });
                  }}
                  onCellChange={(row, column, data) => {
                    dispatch({
                      type: "editor/table/space/cell/change",
                      table_id: table_id!,
                      gdoc_table_id: tb!.id,
                      row: row.__gf_id,
                      column: column,
                      data: data,
                    });
                  }}
                  onSelectedCellChange={({ pk, column }) => {
                    dispatch({
                      type: "editor/data-grid/cell/select",
                      pk: pk,
                      column,
                    });
                  }}
                  highlightTokens={
                    state.datagrid_query?.q_text_search?.query
                      ? [state.datagrid_query?.q_text_search.query]
                      : []
                  }
                  selectedCells={selectedCells}
                />
              </GridLayout.Content>
            )}
          </GridFileStorageQueueProvider>
          <GridLayout.Footer>
            <div className="flex gap-4 items-center">
              <GridQueryPaginationControl {...query} />
              <GridQueryLimitSelect
                value={query.limit}
                onValueChange={query.onLimit}
              />
            </div>
            <GridLayout.FooterSeparator />
            <GridQueryCount count={count ?? rows?.length} keyword="record" />
            <GridLayout.FooterSeparator />
            <GridRefreshButton
              refreshing={refresh.refreshing}
              onRefreshClick={refresh.refresh}
            />
            {state.doctype === "v0_form" && tb?.provider === "grida" && (
              <>
                <GridLayout.FooterSeparator />
                <GridaFormsResponsesExportCSV />
              </>
            )}
          </GridLayout.Footer>
        </GridLayout.Root>
      </TableDefinitionProvider>
    </SchemaNameProvider>
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
              const cell = row.data[col.id]?.value;
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

function TableQueryToggles() {
  const tb = useDatagridTable();
  const query = useDataGridQuery();
  // const search = useDataGridTextSearch();

  const { isPredicatesSet, isOrderbySet } = query;
  if (!tb) return <></>;

  return (
    <GridLayout.HeaderMenuItems>
      {"x_sb_main_table_connection" in tb ? (
        <>
          <DataQueryPredicatesMenu {...query}>
            <DataQueryPredicatesMenuTriggerButton active={isPredicatesSet} />
          </DataQueryPredicatesMenu>
          <DataQueryOrderByMenu {...query}>
            <DataQueryOrderbyMenuTriggerButton active={isOrderbySet} />
          </DataQueryOrderByMenu>
          <XSBTextSearchInput
            query={query.q_text_search?.query}
            onQueryChange={query.onTextSearchQuery}
            column={query.q_text_search?.column}
            onColumnChange={query.onTextSearchColumn}
          />
        </>
      ) : (
        <>
          {/* local text search - column null */}
          <DataQueryTextSearch
            onValueChange={(v) => {
              query.onTextSearchQuery(v);
              query.onTextSearchColumn(null);
            }}
          />
        </>
      )}
    </GridLayout.HeaderMenuItems>
  );
}

function TableQueryChips() {
  const [state] = useEditorState();
  const query = useDataGridQuery();
  const { predicates, orderby, isOrderbySet } = query;

  return (
    <div className="flex gap-2">
      {isOrderbySet && (
        <>
          <DataQueryOrderbyChip {...query} />
          <GridLayout.HeaderSeparator />
        </>
      )}
      {predicates.map((predicate, i) => (
        <DataQueryPredicateChip key={i} index={i} {...query} />
      ))}
      <DataQueryPrediateAddMenu {...query}>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <PlusIcon className="w-3 h-3 me-2" />
          Add filter
        </Button>
      </DataQueryPrediateAddMenu>
    </div>
  );
}

function TableMod() {
  const [state, dispatch] = useEditorState();

  const openNewTuplePanel = useCallback(() => {
    dispatch({
      type: "editor/panels/record-edit",
      open: true,
      response_id: undefined,
      refresh: true,
    });
  }, [dispatch]);

  const openNewAttributePanel = useCallback(() => {
    dispatch({
      type: "editor/panels/field-edit",
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
          type: "editor/table/space/rows/delete/selected",
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
  const db_table_id = useDatabaseTableId();
  const { datagrid_table_id, datagrid_selected_rows } = state;
  const { row_keyword } = useDatagridTable() || { row_keyword: "row" };

  const delete_selected_rows = useDeleteSelectedSchemaTableRows();

  const delete_selected_x_supabase_table_rows = useCallback(() => {
    if (!db_table_id || tb?.provider !== "x-supabase") {
      toast.error("Something went wrong. Please refresh the page.");
      return;
    }

    if (!tb.x_sb_main_table_connection.pk) {
      toast.error("Cannot delete rows without a primary key");
      return;
    }

    const res = PrivateEditorApi.SupabaseQuery.delete_request({
      form_id: db_table_id,
      main_table_id: tb.x_sb_main_table_connection.sb_table_id,
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
        type: "editor/table/space/rows/delete/selected",
      });
    });

    toast.promise(res, {
      loading: "Deleting...",
      success: "Deleted",
      error: "Failed",
    });
  }, [tb, db_table_id, datagrid_selected_rows, dispatch]);

  const delete_selected_x_supabase_main_table_rows = useCallback(() => {
    if (
      !db_table_id ||
      tb?.id !== EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
    ) {
      toast.error("Something went wrong. Please refresh the page.");
      return;
    }

    return delete_selected_x_supabase_table_rows();
  }, [tb?.id, db_table_id, delete_selected_x_supabase_table_rows]);

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
        switch (tb?.provider) {
          case "x-supabase":
            delete_selected_x_supabase_table_rows();
            break;
          case "grida":
            delete_selected_rows();
            break;
          default:
            toast.error("Something went wrong. Please refresh the page.");
            break;
        }
        break;
    }
  }, [
    tb?.provider,
    datagrid_table_id,
    delete_selected_rows,
    delete_selected_x_supabase_table_rows,
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
            className={buttonVariants({ variant: "destructive" })}
          >
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
