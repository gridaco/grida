import React, { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Data } from "@/lib/data";
import { useDebounce } from "@uidotdev/usehooks";
import { QueryChip } from "../ui/chip";
import { PostgresTypeTools } from "@/lib/x-supabase/typemap";
import {
  SQLLiteralInputValue,
  XSBSQLLiteralInput,
} from "./xsb/xsb-sql-literal-input";
import { KeyIcon } from "lucide-react";
import {
  Link2Icon,
  Cross2Icon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { PopoverClose } from "@radix-ui/react-popover";
import { WorkbenchUI } from "@/components/workbench";
import {
  useDataPlatform,
  useSchemaName,
  useTableDefinition,
  type IDataQueryPredicatesConsumer,
} from "@/scaffolds/data-query";
import { toShorter } from "@/lib/pg-meta/k/alias";

const {
  Query: { Predicate },
} = Data;

export function DataQueryPredicatesMenu({
  children,
  ...props
}: React.PropsWithChildren<IDataQueryPredicatesConsumer>) {
  const {
    isPredicatesSet: isset,
    predicates,
    onPredicatesRemove: onRemove,
    onPredicatesUpdate: onUpdate,
    onPredicatesClear: onClear,
  } = props;

  const def = useTableDefinition();
  const attributes = def ? Object.keys(def.properties) : [];
  const properties = def ? def.properties : {};

  const schema_name = useSchemaName();
  const platform = useDataPlatform();

  if (!isset) {
    return (
      <DataQueryPrediateAddMenu {...props}>{children}</DataQueryPrediateAddMenu>
    );
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

                const onchange = (
                  predicate: Partial<Data.Query.Predicate.ExtendedPredicate>
                ) => {
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
                                  {toShorter(properties[key].format)}
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
                              {Predicate.K.operators[q.op].symbol}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Predicate.K.ui_supported_operators.map((key) => (
                              <SelectItem value={key} key={key}>
                                {key}
                                <small className="ms-1 text-muted-foreground">
                                  {Predicate.K.operators[key].label}
                                </small>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        {platform.provider == "x-supabase" ? (
                          <XSBSQLLiteralInput
                            supabase={{
                              supabase_project_id: platform.supabase_project_id,
                              supabase_schema_name: schema_name!,
                            }}
                            config={
                              q.op === "is"
                                ? {
                                    type: "is",
                                    accepts_boolean:
                                      format === "bool" || format === "boolean",
                                  }
                                : PostgresTypeTools.getSQLLiteralInputConfig(
                                    properties[q.column]
                                  )
                            }
                            value={q.value as string}
                            // TODO: have a debounce here
                            onValueChange={(v) => onchange({ value: v })}
                          />
                        ) : (
                          <>only works with x-supabase</>
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
            <DataQueryPrediateAddMenu asChild {...props}>
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
  ...props
}: React.PropsWithChildren<
  IDataQueryPredicatesConsumer & { asChild?: boolean }
>) {
  const { onPredicatesAdd: onAdd } = props;

  const def = useTableDefinition();
  const attributes = def ? Object.keys(def.properties) : [];
  const properties = def ? def.properties : {};

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChild}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {attributes.length === 0 && (
          <div className="p-4 border border-dashed">
            <span className="text-xs text-muted-foreground">
              No attributes found
            </span>
          </div>
        )}
        {attributes.map((key) => {
          const property = properties[key];

          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => onAdd({ column: key, op: "eq", value: null })}
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

export function DataQueryPredicateChip({
  index,
  ...props
}: IDataQueryPredicatesConsumer & { index: number }) {
  const { predicates, onPredicatesRemove, onPredicatesUpdate } = props;

  const def = useTableDefinition();
  const properties = def ? def.properties : {};

  const schema_name = useSchemaName();

  const platform = useDataPlatform();

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
    (predicate: Partial<Data.Query.Predicate.ExtendedPredicate>) => {
      onPredicatesUpdate(index, predicate);
    },
    [onPredicatesUpdate, index]
  );

  const onOpChange = useCallback(
    (
      op:
        | Data.Query.Predicate.PredicateOperatorKeyword
        | Data.Query.Predicate.Extension.PrediacteExtensionType
    ) => {
      const config = Predicate.K.operators[op];
      if (config.required) onChange({ op });
      else onChange({ op, value: null });
    },
    [onChange]
  );

  useEffect(
    () => {
      onChange({ value: debouncedSearch });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedSearch]
  );

  const allowed_ops = Predicate.K.get_operators_by_format(format);

  const requires_value = Predicate.K.operators[predicate.op].required;

  const this_supported_extensions = Predicate.K.supported_extensions.filter(
    (ext) => {
      const op = Predicate.K.operators[ext];
      const supported =
        allowed_ops.includes(op.extends!) &&
        (op.format ? op.format.includes(format as unknown as any) : true);

      return supported;
    }
  );

  const this_has_supported_extensions = this_supported_extensions.length > 0;

  const fulfilled = !requires_value || !!predicate.value;

  return (
    <Popover modal>
      <PopoverTrigger>
        <QueryChip badge={!fulfilled} active={fulfilled}>
          {predicate.column} {Predicate.K.operators[predicate.op].symbol}{" "}
          {fulfilled ? (requires_value ? String(predicate.value) : "") : "..."}
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
              onValueChange={(v) => onOpChange(v as any)}
            >
              <SelectPrimitive.Trigger>
                <Badge
                  variant="outline"
                  className="px-1 w-full overflow-ellipsis text-xs text-muted-foreground whitespace-nowrap"
                >
                  <SelectValue>
                    {Predicate.K.operators[predicate.op].symbol}
                  </SelectValue>
                </Badge>
              </SelectPrimitive.Trigger>
              <SelectContent>
                {this_has_supported_extensions && (
                  <SelectGroup>
                    {this_supported_extensions.map((ext) => {
                      const op = Predicate.K.operators[ext];
                      return (
                        <SelectItem value={ext} key={ext}>
                          {op.label}
                        </SelectItem>
                      );
                    })}
                    <SelectSeparator />
                  </SelectGroup>
                )}
                <SelectGroup>
                  {this_has_supported_extensions && (
                    <SelectLabel className="text-xs text-muted-foreground uppercase">
                      Advanced
                    </SelectLabel>
                  )}
                  {Predicate.K.ui_supported_operators.map((key) => (
                    <SelectItem
                      value={key}
                      key={key}
                      disabled={!allowed_ops.includes(key as any)}
                    >
                      {key}
                      <small className="ms-1 text-muted-foreground">
                        {Predicate.K.operators[key].label}
                      </small>
                    </SelectItem>
                  ))}
                </SelectGroup>
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
        {requires_value && (
          <>
            {platform.provider == "x-supabase" ? (
              <XSBSQLLiteralInput
                supabase={{
                  supabase_project_id: platform.supabase_project_id,
                  supabase_schema_name: schema_name!,
                }}
                config={
                  predicate.op === "is"
                    ? {
                        type: "is",
                        accepts_boolean:
                          format === "bool" || format === "boolean",
                      }
                    : PostgresTypeTools.getSQLLiteralInputConfig(
                        properties[predicate.column]
                      )
                }
                value={search as string}
                onValueChange={(v) => setSearch(v)}
              />
            ) : (
              <>only works with x-supabase</>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
  //
}
