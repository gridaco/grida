"use client";

import React, { useCallback } from "react";
import { useDatagridTable, useEditorState } from "@/scaffolds/editor";
import {
  Cross2Icon,
  DotIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDownUpIcon } from "lucide-react";
import { cn } from "@/utils";
import { PopoverClose } from "@radix-ui/react-popover";
import {
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
} from "@/scaffolds/editor/state";
import { IconButtonDotBadge } from "./dotbadge";
import { WorkbenchUI } from "@/components/workbench";

/**
 * this can also be used for form query, but at this moment, form does not have a db level field sorting query.
 * plus, this uses the column name, which in the future, it should be using field id for more universal handling.
 * when it updates to id, the x-supabase query route will also have to change.
 */
export function XSupaDataGridSort() {
  const [state, dispatch] = useEditorState();

  const { datagrid_orderby } = state;

  const tb = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const properties =
    tb?.x_sb_main_table_connection.sb_table_schema.properties ?? {};

  const isset = Object.keys(datagrid_orderby).length > 0;

  const keys = Object.keys(properties);
  const usedkeys = Object.keys(datagrid_orderby);
  const unusedkeys = keys.filter((key) => !usedkeys.includes(key));

  const onClear = useCallback(() => {
    dispatch({ type: "editor/data-grid/orderby/clear" });
  }, [dispatch]);

  const onAdd = useCallback(
    (column_id: string) => {
      dispatch({
        type: "editor/data-grid/orderby",
        column_id: column_id,
        data: {},
      });
    },
    [dispatch]
  );

  const onUpdate = useCallback(
    (column_id: string, data: { ascending?: boolean }) => {
      dispatch({
        type: "editor/data-grid/orderby",
        column_id: column_id,
        data: data,
      });
    },
    [dispatch]
  );

  const onRemove = useCallback(
    (column_id: string) => {
      dispatch({
        type: "editor/data-grid/orderby",
        column_id: column_id,
        data: null,
      });
    },
    [dispatch]
  );

  return (
    <Popover modal>
      <PopoverTrigger>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "relative",
                "text-muted-foreground",
                isset && " text-accent-foreground"
              )}
            >
              <ArrowDownUpIcon
                data-state={isset ? "on" : "off"}
                className="w-4 h-4 text-muted-foreground data-[state='on']:text-workbench-accent-1"
              />
              {isset && <IconButtonDotBadge />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sort</TooltipContent>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent className="p-2 w-full">
        <section className="py-2" hidden={!isset}>
          <div className="flex flex-col space-y-2 w-full">
            {usedkeys.map((col) => {
              const orderby = datagrid_orderby[col];
              return (
                <div key={col} className="flex gap-2 px-2 w-full">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex-1">
                      <Select
                        disabled
                        value={orderby.column}
                        onValueChange={(value) => {
                          onUpdate(value, orderby);
                        }}
                      >
                        <SelectTrigger
                          className={WorkbenchUI.selectVariants({
                            variant: "trigger",
                            size: "sm",
                          })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(properties).map((key) => (
                            <SelectItem key={key} value={key}>
                              {key}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Select
                        value={orderby.ascending ? "ASC" : "DESC"}
                        onValueChange={(value) => {
                          onUpdate(orderby.column, {
                            ascending: value === "ASC",
                          });
                        }}
                      >
                        <SelectTrigger
                          className={WorkbenchUI.selectVariants({
                            variant: "trigger",
                            size: "sm",
                          })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ASC">Ascending</SelectItem>
                          <SelectItem value="DESC">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onRemove(col)}
                  >
                    <Cross2Icon />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="flex flex-col">
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="min-w-40">
              <Button variant="ghost" size="sm" className="flex justify-start">
                <PlusIcon className="w-4 h-4 me-2 align-middle" /> Pick a column
                to sort by
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {unusedkeys.map((key) => (
                <DropdownMenuItem key={key} onSelect={() => onAdd(key)}>
                  {key}{" "}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {properties[key].format}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {isset && (
            <PopoverClose asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex justify-start"
                onClick={onClear}
              >
                <TrashIcon className="w-4 h-4 me-2 align-middle" /> Delete sort
              </Button>
            </PopoverClose>
          )}
        </section>
      </PopoverContent>
    </Popover>
  );
}
