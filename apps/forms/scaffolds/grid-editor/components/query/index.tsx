"use client";

import React, { useCallback } from "react";
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
import { IconButtonDotBadge } from "../dotbadge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SQLPredicate } from "@/types";
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { operator_labels, supported_operators } from "./data";
import { useDataGridPredicates } from "./hooks";
import { AddPrediateMenu } from "./predicate";

export function XSupaDataGridFilter() {
  const {
    table,
    isset,
    attributes,
    properties,
    predicates,
    add,
    remove,
    update,
    clear,
  } = useDataGridPredicates();

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
              {predicates.map((q, i) => {
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
                          <SelectTrigger
                            className={WorkbenchUI.selectVariants({
                              variant: "trigger",
                              size: "sm",
                            })}
                          >
                            <SelectValue>{q.column}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {attributes.map((key) => (
                              <SelectItem value={key} key={key}>
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
                          <SelectTrigger
                            className={WorkbenchUI.selectVariants({
                              variant: "trigger",
                              size: "sm",
                            })}
                          >
                            <SelectValue>
                              {operator_labels[q.op].symbol}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {supported_operators.map((key) => (
                              <SelectItem value={key} key={key}>
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
                          className={WorkbenchUI.inputVariants({
                            variant: "input",
                            size: "sm",
                          })}
                        />
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => remove(i)}
                      className={WorkbenchUI.buttonVariants({
                        variant: "outline",
                        size: "icon",
                      })}
                    >
                      <Cross2Icon />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <AddPrediateMenu>
              <Button
                variant="ghost"
                size="sm"
                className="w-full flex justify-start"
              >
                <PlusIcon className="w-4 h-4 me-2 align-middle" />
                Add Filter
              </Button>
            </AddPrediateMenu>
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
