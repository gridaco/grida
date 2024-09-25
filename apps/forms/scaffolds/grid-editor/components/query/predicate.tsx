import React, { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { SQLPredicate } from "@/types";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { operator_labels, supported_operators } from "../../k";
import { useDebounce } from "@uidotdev/usehooks";
import { QueryChip } from "../ui/chip";
import { GridaXSupabaseTypeMap } from "@/lib/x-supabase/typemap";
import { useDataGridQuery, useEditorState } from "@/scaffolds/editor/use";
import {
  SQLLiteralInputValue,
  XSBSQLLiteralInput,
} from "../../xsb/xsb-sql-literal-input";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { KeyIcon } from "lucide-react";
import {
  Link2Icon,
  Cross2Icon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { PopoverClose } from "@radix-ui/react-popover";
import { WorkbenchUI } from "@/components/workbench";

export function DataQueryPredicatesMenu({
  children,
}: React.PropsWithChildren<{}>) {
  const {
    table,
    isPredicatesSet: isset,
    keys: attributes,
    properties,
    predicates,
    onPredicatesRemove: onRemove,
    onPredicatesUpdate: onUpdate,
    onPredicatesClear: onClear,
  } = useDataGridQuery();

  if (!isset) {
    return <DataQueryPrediateAddMenu>{children}</DataQueryPrediateAddMenu>;
  }

  return (
    <>
      <Popover modal>
        <PopoverTrigger>{children}</PopoverTrigger>
        <PopoverContent className="p-2 w-full">
          <section className="py-2" hidden={!isset}>
            <div className="flex flex-col space-y-2 w-full">
              {predicates.map((q, i) => {
                const format = properties[q.column].format;

                const onchange = (predicate: Partial<SQLPredicate>) => {
                  onUpdate(i, predicate);
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
                        {table?.x_sb_main_table_connection ? (
                          <XSBSQLLiteralInput
                            supabase={{
                              supabase_project_id:
                                table?.x_sb_main_table_connection
                                  .supabase_project_id,
                              supabase_schema_name:
                                table?.x_sb_main_table_connection
                                  .sb_schema_name,
                            }}
                            config={
                              q.op === "is"
                                ? {
                                    type: "is",
                                    accepts_boolean:
                                      format === "bool" || format === "boolean",
                                  }
                                : GridaXSupabaseTypeMap.getSQLLiteralInputConfig(
                                    SupabasePostgRESTOpenApi.parse_postgrest_property_meta(
                                      q.column,
                                      properties[q.column],
                                      null
                                    )
                                  )
                            }
                            value={q.value as string}
                            // TODO: have a debounce here
                            onValueChange={(v) => onchange({ value: v })}
                          />
                        ) : (
                          <>N/A</>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => onRemove(i)}
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
            <DataQueryPrediateAddMenu asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full flex justify-start"
              >
                <PlusIcon className="w-4 h-4 me-2 align-middle" />
                Add Filter
              </Button>
            </DataQueryPrediateAddMenu>
            {isset && (
              <PopoverClose asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full flex justify-start"
                  onClick={onClear}
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

export function DataQueryPrediateAddMenu({
  asChild,
  children,
}: React.PropsWithChildren<{ asChild?: boolean }>) {
  const {
    keys: attributes,
    properties,
    onPredicatesAdd: onAdd,
  } = useDataGridQuery();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChild}>{children}</DropdownMenuTrigger>
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
              onSelect={() => onAdd({ column: key, op: "eq", value: "" })}
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

export function DataQueryPredicateChip({ index }: { index: number }) {
  const {
    table,
    properties,
    predicates,
    onPredicatesRemove,
    onPredicatesUpdate,
  } = useDataGridQuery();

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
    onPredicatesRemove(index);
  }, [onPredicatesRemove, index]);

  const onChange = useCallback(
    (predicate: Partial<SQLPredicate>) => {
      onPredicatesUpdate(index, predicate);
    },
    [onPredicatesUpdate, index]
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
