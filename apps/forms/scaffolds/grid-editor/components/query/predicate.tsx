import React, { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { SQLPredicate } from "@/types";
import { CaretDownIcon, TrashIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDataGridPredicates } from "./hooks";
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { operator_labels, supported_operators } from "./data";
import { useDebounce } from "@uidotdev/usehooks";
import { QueryChip } from "./chip";
import type { PGSupportedColumnType } from "@/lib/supabase-postgrest/@types/pg";
import { GridaXSupabaseTypeMap } from "@/lib/x-supabase/typemap";

export function AddPrediateMenu({ children }: React.PropsWithChildren<{}>) {
  const { attributes, properties, add } = useDataGridPredicates();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {attributes.map((key) => (
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
  );
}

export function PredicateChip({ index }: { index: number }) {
  const { properties, predicates, add, remove, update } =
    useDataGridPredicates();

  const predicate = predicates[index];

  const format =
    predicate.column in properties
      ? properties[predicate.column].format
      : "text";

  const [search, setSearch] = React.useState(predicate.value as string);

  const debouncedSearch = useDebounce(search, 500);

  const onRemove = useCallback(() => {
    remove(index);
  }, [remove, index]);

  const onChange = useCallback(
    (predicate: Partial<SQLPredicate>) => {
      update(index, predicate);
    },
    [update, index]
  );

  useEffect(() => {
    onChange({ value: debouncedSearch });
  }, [onChange, debouncedSearch]);

  return (
    <Popover modal>
      <PopoverTrigger>
        <QueryChip badge={!!!predicate.value} active={!!predicate.value}>
          {predicate.column} {predicate.op}{" "}
          {!!predicate.value ? ": " + String(predicate.value) : ""}
        </QueryChip>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2 w-[200px] p-2">
        <div className="flex justify-between">
          <div className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground">
              {predicate.column}
            </span>
            <Select
              value={predicate.op}
              onValueChange={(v) => onChange({ op: v as any })}
            >
              <SelectPrimitive.Trigger>
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  <SelectValue>
                    {operator_labels[predicate.op].symbol}
                  </SelectValue>
                </Badge>
              </SelectPrimitive.Trigger>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="w-6 h-6"
          >
            <TrashIcon className="w-3 h-3" />
          </Button>
        </div>
        <Input
          type={
            predicate.op !== "is"
              ? GridaXSupabaseTypeMap.getInputType({ format }) ?? "search"
              : "search"
          }
          autoFocus
          value={search as string}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a value..."
          className={WorkbenchUI.inputVariants({
            variant: "input",
            size: "sm",
          })}
        />
      </PopoverContent>
    </Popover>
  );
  //
}
