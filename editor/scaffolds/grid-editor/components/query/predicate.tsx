"use client";

import React, { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { TagInput, type Tag as TagInputTag } from "@/components/tag";
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
import { Button } from "@/components/ui-editor/button";
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
import { XPostgrestQuery } from "@/lib/supabase-postgrest/builder";
import { useDebounce } from "@uidotdev/usehooks";
import { QueryChip } from "../ui/chip";
import { PostgresTypeTools } from "@/lib/x-supabase/typemap";
import { XSBSQLLiteralInput } from "./xsb/xsb-sql-literal-input";
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
  usePredicateConfig,
} from "@/scaffolds/data-query";
import type { ColorTintedItem } from "@/scaffolds/data-query";
import { toShorter } from "@/lib/pg-meta/k/alias";
import type { SQLLiteralInputValue } from "./types";
import { SQLLiteralInput } from "./sql-literal-input";

const {
  Query: { Predicate },
} = Data;

const { parsePostgresTextArrayLiteral, toPostgresTextArrayLiteral } =
  XPostgrestQuery.Literal;

function areTagInputTagsEqual(a: TagInputTag[], b: TagInputTag[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].text !== b[i].text) return false;
    if (a[i].color !== b[i].color) return false;
  }
  return true;
}

function normalizeEnumOptions(
  options: string[] | ColorTintedItem[] | undefined
): TagInputTag[] | undefined {
  if (!options || options.length === 0) return undefined;
  const first = options[0];
  if (typeof first === "string") {
    return (options as string[]).map((v) => ({ id: v, text: v }));
  }

  return (options as ColorTintedItem[]).map((o) => ({
    id: o.value,
    text: o.value,
    color: o.color,
  }));
}

function ArrayPredicateValueInput({
  value,
  onValueChange,
  options,
}: {
  value: unknown;
  onValueChange: (value: string | null) => void;
  options?: TagInputTag[];
}) {
  const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(
    null
  );
  const [tags, setTags] = React.useState<TagInputTag[]>(() =>
    parsePostgresTextArrayLiteral(value).map((t) => ({ id: t, text: t }))
  );

  useEffect(() => {
    const colorByText = new Map(
      (options ?? []).map((o) => [o.text, o.color] as const)
    );
    const next = parsePostgresTextArrayLiteral(value).map((t) => ({
      id: t,
      text: t,
      color: colorByText.get(t),
    }));
    setTags((prev) => (areTagInputTagsEqual(prev, next) ? prev : next));
  }, [value, options]);

  useEffect(() => {
    const cleaned = tags.map((t) => t.text.trim()).filter((t) => t.length > 0);
    const encoded = cleaned.length ? toPostgresTextArrayLiteral(cleaned) : null;

    const current =
      typeof value === "string" ? value : value == null ? null : String(value);

    if (encoded === current) return;
    onValueChange(encoded);
  }, [tags, value, onValueChange]);

  return (
    <TagInput
      tags={tags}
      setTags={setTags}
      activeTagIndex={activeTagIndex}
      setActiveTagIndex={setActiveTagIndex}
      placeholder="Comma separated values"
      enableAutocomplete={(options?.length ?? 0) > 0}
      restrictTagsToAutocompleteOptions={(options?.length ?? 0) > 0}
      autocompleteOptions={options}
    />
  );
}

function ArrayPredicateValuePopover({
  value,
  onValueChange,
  options,
}: {
  value: unknown;
  onValueChange: (value: string | null) => void;
  options?: TagInputTag[];
}) {
  const tags = parsePostgresTextArrayLiteral(value);
  const label = tags.length > 0 ? tags.join(", ") : "Select values";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full max-w-64 justify-start font-normal overflow-hidden"
        >
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-2 w-[320px]" align="start">
        <ArrayPredicateValueInput
          value={value}
          onValueChange={onValueChange}
          options={options}
        />
      </PopoverContent>
    </Popover>
  );
}

function PredicateValueEditor({
  predicate,
  meta,
  platform,
  schema_name,
  predicateConfig,
  onValueChange,
}: {
  predicate: Data.Query.Predicate.ExtendedPredicate;
  meta: Data.Relation.Attribute;
  platform: ReturnType<typeof useDataPlatform>;
  schema_name: string | undefined;
  predicateConfig: ReturnType<typeof usePredicateConfig>;
  onValueChange: (value: SQLLiteralInputValue) => void;
}) {
  const enumOptionsRaw = meta.array
    ? predicateConfig?.getEnumOptions?.(meta)
    : undefined;
  const enumOptions = normalizeEnumOptions(enumOptionsRaw);
  const isArrayEnum = Array.isArray(enumOptions) && enumOptions.length > 0;
  const isArray = !!meta.array;

  if (isArrayEnum) {
    return (
      <ArrayPredicateValuePopover
        value={predicate.value}
        onValueChange={(v) => onValueChange(v ?? undefined)}
        options={enumOptions}
      />
    );
  }

  if (isArray) {
    return (
      <ArrayPredicateValuePopover
        value={predicate.value}
        onValueChange={(v) => onValueChange(v ?? undefined)}
      />
    );
  }

  if (platform.provider === "x-supabase") {
    return (
      <XSBSQLLiteralInput
        supabase={{
          supabase_project_id: platform.supabase_project_id,
          supabase_schema_name: schema_name!,
        }}
        config={PostgresTypeTools.getSQLLiteralInputConfig(meta, predicate.op)}
        value={predicate.value as string}
        onValueChange={onValueChange}
      />
    );
  }

  return (
    <SQLLiteralInput
      config={PostgresTypeTools.getSQLLiteralInputConfig(meta, predicate.op)}
      value={predicate.value as string}
      onValueChange={onValueChange}
    />
  );
}

export function DataQueryPredicatesMenu({
  children,
  asChild,
  ...props
}: React.PropsWithChildren<
  IDataQueryPredicatesConsumer & {
    asChild?: boolean;
  }
>) {
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
  const predicateConfig = usePredicateConfig();

  if (!isset) {
    return (
      <DataQueryPrediateAddMenu {...props} asChild={asChild}>
        {children}
      </DataQueryPrediateAddMenu>
    );
  }

  return (
    <>
      <Popover modal>
        <PopoverTrigger asChild={asChild}>{children}</PopoverTrigger>
        <PopoverContent className="p-2 w-full">
          <section className="py-2" hidden={!isset}>
            <div className="flex flex-col space-y-2 w-full">
              {predicates.map((q, i) => {
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
                        <PredicateValueEditor
                          predicate={q}
                          meta={properties[q.column]}
                          platform={platform}
                          schema_name={schema_name}
                          predicateConfig={predicateConfig}
                          onValueChange={(v) => onchange({ value: v })}
                        />
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => onRemove(i)}
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
                <PlusIcon className="size-4 me-2 align-middle" />
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
                  <TrashIcon className="size-4 me-2 align-middle" /> Delete
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
  const predicateConfig = usePredicateConfig();

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
          const defaults = predicateConfig?.getDefaultPredicate?.(property);
          const default_op = defaults?.op ?? "eq";
          const default_value =
            "value" in (defaults ?? {}) ? (defaults as any).value : null;

          return (
            <DropdownMenuItem
              key={key}
              onSelect={() =>
                onAdd({
                  column: key,
                  op: default_op as any,
                  value: default_value ?? null,
                })
              }
            >
              <div className="size-4 flex items-center justify-center gap-2">
                {property.pk && <KeyIcon className="size-3" />}
                {property.fk && <Link2Icon className="size-3" />}
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
  const predicateConfig = usePredicateConfig();

  const schema_name = useSchemaName();

  const platform = useDataPlatform();

  const predicate = predicates[index];
  const meta = properties[predicate.column];
  const enumOptions = normalizeEnumOptions(
    meta && meta.array ? predicateConfig?.getEnumOptions?.(meta) : undefined
  );
  const isArrayEnum = Array.isArray(enumOptions) && enumOptions.length > 0;
  const isArray = !!meta?.array;

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

  useEffect(() => {
    if (isArrayEnum || isArray) return;
    onChange({ value: debouncedSearch });
  }, [debouncedSearch, isArrayEnum, isArray]);

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
  const chipValue =
    fulfilled && requires_value
      ? meta?.array && typeof predicate.value === "string"
        ? (() => {
            const items = parsePostgresTextArrayLiteral(predicate.value);
            return items.length > 0 ? items.join(", ") : predicate.value;
          })()
        : String(predicate.value)
      : "";

  return (
    <Popover modal>
      <PopoverTrigger>
        <QueryChip badge={!fulfilled} active={fulfilled}>
          <span className="inline-flex max-w-64 items-center gap-1 overflow-hidden align-middle">
            <span className="font-semibold">{predicate.column}</span>
            <span>{Predicate.K.operators[predicate.op].symbol}</span>
            <span className="truncate">{fulfilled ? chipValue : "..."}</span>
          </span>
        </QueryChip>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2 w-[200px] p-2">
        <div className="flex justify-between w-full">
          <div className="flex gap-2 items-center w-full overflow-hidden">
            <span className="text-xs text-muted-foreground  overflow-hidden text-ellipsis">
              {predicate.column}
            </span>
            <Select
              value={predicate.op}
              onValueChange={(v) => onOpChange(v as any)}
            >
              <SelectPrimitive.Trigger>
                <Badge
                  variant="outline"
                  className="px-1 w-full text-ellipsis text-xs text-muted-foreground whitespace-nowrap"
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
            className="size-6 min-w-6 min-h-6"
          >
            <TrashIcon className="size-3" />
          </Button>
        </div>
        {requires_value && (
          <>
            {isArrayEnum ? (
              <ArrayPredicateValueInput
                value={predicate.value}
                onValueChange={(v) => onChange({ value: v })}
                options={enumOptions!}
              />
            ) : isArray ? (
              <ArrayPredicateValueInput
                value={predicate.value}
                onValueChange={(v) => onChange({ value: v })}
              />
            ) : platform.provider == "x-supabase" ? (
              <XSBSQLLiteralInput
                supabase={{
                  supabase_project_id: platform.supabase_project_id,
                  supabase_schema_name: schema_name!,
                }}
                config={PostgresTypeTools.getSQLLiteralInputConfig(
                  properties[predicate.column],
                  predicate.op
                )}
                value={search as string}
                onValueChange={(v) => setSearch(v)}
              />
            ) : (
              <SQLLiteralInput
                config={PostgresTypeTools.getSQLLiteralInputConfig(
                  properties[predicate.column],
                  predicate.op
                )}
                value={search as string}
                onValueChange={(v) => setSearch(v)}
              />
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
  //
}
