import React, { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { SQLPredicate } from "@/types";
import {
  BoxIcon,
  CheckboxIcon,
  TrashIcon,
  ValueIcon,
  ValueNoneIcon,
} from "@radix-ui/react-icons";
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
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { operator_labels, supported_operators } from "./data";
import { useDebounce } from "@uidotdev/usehooks";
import { QueryChip } from "./chip";
import { GridaXSupabaseTypeMap } from "@/lib/x-supabase/typemap";
import { useDataGridPredicates } from "@/scaffolds/editor/use";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckedState } from "@radix-ui/react-checkbox";
import { intersect } from "@/utils/intersect";

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

  const allowed_ops = GridaXSupabaseTypeMap.getPredicateOperators({ format });

  return (
    <Popover modal>
      <PopoverTrigger>
        <QueryChip badge={!!!predicate.value} active={!!predicate.value}>
          {predicate.column} {operator_labels[predicate.op].symbol}{" "}
          {!!predicate.value ? String(predicate.value) : "..."}
        </QueryChip>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2 w-[200px] p-2">
        <div className="flex justify-between w-full">
          <div className="flex gap-2 items-center w-full overflow-hidden">
            <span className="text-xs text-muted-foreground  overflow-hidden overflow-ellipsis">
              {predicate.column}
            </span>
            <Select
              value={predicate.op}
              onValueChange={(v) => onChange({ op: v as any })}
            >
              <SelectPrimitive.Trigger>
                <Badge
                  variant="outline"
                  className="w-full overflow-ellipsis text-xs text-muted-foreground"
                >
                  <SelectValue>
                    {operator_labels[predicate.op].symbol}
                  </SelectValue>
                </Badge>
              </SelectPrimitive.Trigger>
              <SelectContent>
                {supported_operators.map((key) => (
                  <SelectItem
                    value={key}
                    key={key}
                    disabled={!allowed_ops.includes(key)}
                  >
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
            className="w-6 h-6 min-w-6 min-h-6"
          >
            <TrashIcon className="w-3 h-3" />
          </Button>
        </div>
        <SQLLiteralInput
          literal={
            predicate.op === "is"
              ? {
                  type: "is",
                  accepts_boolean: format === "bool" || format === "boolean",
                }
              : {
                  type:
                    (GridaXSupabaseTypeMap.getLiteralInputType({
                      format,
                    }) as "text") ?? "text",
                }
          }
          value={search as string}
          onValueChange={(v) => setSearch(v)}
        />
      </PopoverContent>
    </Popover>
  );
  //
}

function SQLLiteralInput({
  value,
  onValueChange,
  literal,
  autoFocus,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  literal: GridaXSupabaseTypeMap.SQLLiteralInputType;
  autoFocus?: boolean;
}) {
  switch (literal.type) {
    case "text":
    case "datetime-local":
    case "date":
    case "number":
    case "time":
      return (
        <Input
          type={literal.type}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Type a value..."
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={WorkbenchUI.inputVariants({
            variant: "input",
            size: "sm",
          })}
        />
      );
    case "boolean":
      return (
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger autoFocus={autoFocus}>
            <SelectValue placeholder={"Select a value..."} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">
              <CheckboxIcon className="inline-flex align-middle w-4 h-4 me-1" />
              true
            </SelectItem>
            <SelectItem value="false">
              <BoxIcon className="inline-flex align-middle w-4 h-4 me-1" />
              false
            </SelectItem>
          </SelectContent>
        </Select>
      );
    case "is":
      return (
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger autoFocus={autoFocus}>
            <SelectValue placeholder={"Select a value..."} />
          </SelectTrigger>
          <SelectContent>
            {literal.accepts_boolean && (
              <>
                <SelectItem value="true">
                  <CheckboxIcon className="inline-flex align-middle w-4 h-4 me-1" />
                  true
                </SelectItem>
                <SelectItem value="false">
                  <BoxIcon className="inline-flex align-middle w-4 h-4 me-1" />
                  false
                </SelectItem>
              </>
            )}
            <SelectItem value="null">
              <ValueNoneIcon className="inline-flex align-middle w-4 h-4 me-1" />
              null
            </SelectItem>
            <SelectItem value="not null">
              <ValueIcon className="inline-flex align-middle w-4 h-4 me-1" />
              not null
            </SelectItem>
          </SelectContent>
        </Select>
      );
    // TODO:
    case "json":
    case "xml":
      // case "search":
      return (
        <Input
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Type a value..."
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={WorkbenchUI.inputVariants({
            variant: "input",
            size: "sm",
          })}
        />
      );
    default:
      break;
  }
}
