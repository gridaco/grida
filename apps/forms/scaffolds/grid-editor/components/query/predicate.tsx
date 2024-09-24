import React, { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { SQLPredicate } from "@/types";
import { Link2Icon, TrashIcon } from "@radix-ui/react-icons";
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
import { GridaXSupabaseTypeMap } from "@/lib/x-supabase/typemap";
import { useDataGridPredicates, useEditorState } from "@/scaffolds/editor/use";
import {
  SQLLiteralInputValue,
  XSBSQLLiteralInput,
} from "./xsb-sql-literal-input";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { KeyIcon } from "lucide-react";

export function AddPrediateMenu({ children }: React.PropsWithChildren<{}>) {
  const { attributes, properties, add } = useDataGridPredicates();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {attributes.map((key) => {
          const property =
            SupabasePostgRESTOpenApi.parse_postgrest_property_meta(
              key,
              properties[key],
              null
            );

          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => add({ column: key, op: "eq", value: "" })}
            >
              <div className="w-4 h-4 flex items-center justify-center gap-2">
                {property.pk && <KeyIcon className="w-3 h-3" />}
                {property.fk && <Link2Icon className="w-3 h-3" />}
              </div>
              <span className="ms-2">{key}</span>
              <span className="ms-2 text-xs text-muted-foreground">
                {property.format}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PredicateChip({ index }: { index: number }) {
  const [state] = useEditorState();
  const { supabase_project } = state;

  const { table, properties, predicates, add, remove, update } =
    useDataGridPredicates();

  const predicate = predicates[index];

  const format =
    predicate.column in properties
      ? properties[predicate.column].format
      : "text";

  const [search, setSearch] = React.useState<SQLLiteralInputValue>(
    predicate.value as SQLLiteralInputValue
  );

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
        {table?.x_sb_main_table_connection ? (
          <XSBSQLLiteralInput
            supabase={{
              supabase_project_id:
                table?.x_sb_main_table_connection.supabase_project_id,
              supabase_schema_name:
                table?.x_sb_main_table_connection.sb_schema_name,
            }}
            config={
              predicate.op === "is"
                ? {
                    type: "is",
                    accepts_boolean: format === "bool" || format === "boolean",
                  }
                : GridaXSupabaseTypeMap.getSQLLiteralInputConfig(
                    SupabasePostgRESTOpenApi.parse_postgrest_property_meta(
                      predicate.column,
                      properties[predicate.column],
                      null
                    )
                  )
            }
            value={search as string}
            onValueChange={(v) => setSearch(v)}
          />
        ) : (
          <>N/A</>
        )}
      </PopoverContent>
    </Popover>
  );
  //
}
