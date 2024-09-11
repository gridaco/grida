"use client";

import React, { useCallback } from "react";
import { useDatagridTable, useEditorState } from "@/scaffolds/editor";
import { Cross2Icon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { ListFilterIcon } from "lucide-react";
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
import { cn } from "@/utils";
import { PopoverClose } from "@radix-ui/react-popover";
import {
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
} from "@/scaffolds/editor/state";
import { IconButtonDotBadge } from "./dotbadge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SQLFilterOperator, SQLPredicate } from "@/types";
import { Input } from "@/components/ui/input";

const supported_operators: SQLFilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
];

const operator_labels: Record<
  SQLFilterOperator,
  { symbol: string; label: string }
> = {
  eq: { symbol: "=", label: "[=] equals" },
  neq: { symbol: "<>", label: "[<>] not equal" },
  gt: { symbol: ">", label: "[>] greater than" },
  gte: { symbol: ">=", label: "[>=] greater than or equal" },
  lt: { symbol: "<", label: "[<] less than" },
  lte: { symbol: "<=", label: "[<=] less than or equal" },
  like: { symbol: "~~", label: "[~~] like operator" },
  ilike: { symbol: "~~*", label: "[~~*] ilike operator" },
  is: { symbol: "is", label: "[is] is (null, not null, true, false)" },
  in: { symbol: "in", label: "[in] one of the values" },
  //
  cs: { symbol: "@>", label: "[@>] contains" }, // Contains operator
  cd: { symbol: "<@", label: "[<@] contained by" }, // Contained by operator
  sl: { symbol: "<<", label: "[<<] strictly left of" }, // Range strictly left
  sr: { symbol: ">>", label: "[>>] strictly right of" }, // Range strictly right
  nxl: { symbol: "&<", label: "[&<] does not extend to the left of" }, // No extend left
  nxr: { symbol: "&>", label: "[&>] does not extend to the right of" }, // No extend right
  adj: { symbol: "-|-", label: "[-|-] adjacent" }, // Adjacent operator
  ov: { symbol: "&&", label: "[&&] overlaps" }, // Overlaps operator
  fts: { symbol: "@@", label: "[@@] full-text search" }, // Full-text search
  plfts: { symbol: "@@@", label: "[@@@] plain full-text search" }, // Plain full-text search
  phfts: { symbol: "@@@@", label: "[@@@@] phrase full-text search" }, // Phrase full-text search
  wfts: { symbol: "@@@@", label: "[@@@@] web search" }, // Web search
};

function useDataGridPredicates() {
  const [state, dispatch] = useEditorState();

  const { datagrid_predicates } = state;

  const add = useCallback(
    (predicate: SQLPredicate) => {
      dispatch({
        type: "editor/data-grid/predicates/add",
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const update = useCallback(
    (index: number, predicate: Partial<SQLPredicate>) => {
      dispatch({
        type: "editor/data-grid/predicates/update",
        index: index,
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const remove = useCallback(
    (index: number) => {
      dispatch({
        type: "editor/data-grid/predicates/remove",
        index: index,
      });
    },
    [dispatch]
  );

  const clear = useCallback(() => {
    dispatch({
      type: "editor/data-grid/predicates/clear",
    });
  }, [dispatch]);

  return {
    datagrid_predicates,
    add,
    update,
    remove,
    clear,
  };
}

export function XSupaDataGridFilter() {
  const [state, dispatch] = useEditorState();

  const { datagrid_predicates, add, remove, update, clear } =
    useDataGridPredicates();

  const tb = useDatagridTable<
    GDocFormsXSBTable | GDocSchemaTableProviderXSupabase
  >();

  const properties =
    tb?.x_sb_main_table_connection.sb_table_schema.properties ?? {};

  const isset = datagrid_predicates.length > 0;

  const columnkeys = Object.keys(properties);

  return (
    <>
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
                <ListFilterIcon
                  data-state={isset ? "on" : "off"}
                  className="w-4 h-4 text-muted-foreground data-[state='on']:text-workbench-accent-1"
                />
                {isset && <IconButtonDotBadge />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter</TooltipContent>
          </Tooltip>
        </PopoverTrigger>
        <PopoverContent className="p-2 w-full">
          <section className="py-2" hidden={!isset}>
            <div className="flex flex-col space-y-2 w-full">
              {datagrid_predicates.map((q, i) => {
                const onchange = (predicate: Partial<SQLPredicate>) => {
                  update(i, predicate);
                };
                return (
                  <div key={i} className="flex gap-2 px-2 w-full">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1">
                        <Select
                          value={q.column}
                          onValueChange={(v) => onchange({ column: v })}
                        >
                          <SelectTrigger>
                            <SelectValue>{q.column}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {columnkeys.map((key) => (
                              <SelectItem value={key}>
                                {key}{" "}
                                <span className="ms-2 text-xs text-muted-foreground">
                                  {properties[key].format}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Select
                          value={q.op}
                          onValueChange={(v) => onchange({ op: v as any })}
                        >
                          <SelectTrigger>
                            <SelectValue>
                              {operator_labels[q.op].symbol}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {supported_operators.map((key) => (
                              <SelectItem value={key}>
                                {key}
                                <small className="ms-1 text-muted-foreground">
                                  {operator_labels[key].label}
                                </small>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Enter a value"
                          value={q.value as string | undefined}
                          onChange={(e) => onchange({ value: e.target.value })}
                        />
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => remove(i)}
                    >
                      <Cross2Icon />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="min-w-40">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full flex justify-start"
                >
                  <PlusIcon className="w-4 h-4 me-2 align-middle" />
                  Add Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {columnkeys.map((key) => (
                  <DropdownMenuItem
                    key={key}
                    onSelect={() => add({ column: key, op: "eq", value: "" })}
                  >
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
                  className="w-full flex justify-start"
                  onClick={clear}
                >
                  <TrashIcon className="w-4 h-4 me-2 align-middle" /> Delete
                  filter
                </Button>
              </PopoverClose>
            )}
          </section>
        </PopoverContent>
      </Popover>
    </>
  );
}
