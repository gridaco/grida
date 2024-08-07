"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import DataGrid, {
  Column,
  CopyEvent,
  PasteEvent,
  RenderCellProps,
  RenderEditCellProps,
  RenderHeaderCellProps,
} from "react-data-grid";
import {
  PlusIcon,
  ChevronDownIcon,
  EnterFullScreenIcon,
  CalendarIcon,
  Link2Icon,
  Pencil1Icon,
  TrashIcon,
  AvatarIcon,
  ArrowRightIcon,
  DownloadIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormInputType } from "@/types";
import { JsonEditCell } from "./json-cell";
import { useEditorState } from "../editor";
import type {
  GFResponseFieldData,
  GFResponseRow,
  GFSystemColumnTypes,
} from "./types";
import { SelectColumn } from "./select-column";
import "./grid.css";
import { unwrapFeildValue } from "@/lib/forms/unwrap";
import { Button } from "@/components/ui/button";
import {
  FileTypeIcon,
  FormFieldTypeIcon,
} from "@/components/form-field-type-icon";
import { toZonedTime } from "date-fns-tz";
import { tztostr } from "../editor/symbols";
import { mask } from "./mask";
import toast from "react-hot-toast";
import { FormValue } from "@/services/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileEditCell } from "./file-cell";
import { RichTextEditCell } from "./richtext-cell";
import Highlight from "@/components/highlight";
import { FieldSupports } from "@/k/supported_field_types";
import { format } from "date-fns";
import { EmptyRowsRenderer } from "./empty";

function rowKeyGetter(row: GFResponseRow) {
  return row.__gf_id;
}

export function ResponseGrid({
  systemcolumns: _systemcolumns,
  columns,
  rows,
  selectionDisabled,
  readonly,
  loading,
  onAddNewFieldClick,
  onEditFieldClick,
  onDeleteFieldClick,
  onCellChange,
}: {
  systemcolumns: {
    key: GFSystemColumnTypes;
    name?: string;
  }[];
  columns: {
    key: string;
    name: string;
    readonly: boolean;
    type?: FormInputType;
  }[];
  rows: GFResponseRow[];
  selectionDisabled?: boolean;
  readonly?: boolean;
  loading?: boolean;
  onAddNewFieldClick?: () => void;
  onEditFieldClick?: (id: string) => void;
  onDeleteFieldClick?: (id: string) => void;
  onCellChange?: (
    row: GFResponseRow,
    column: string,
    data: GFResponseFieldData
  ) => void;
}) {
  const [state, dispatch] = useEditorState();
  const { selected_rows: selected_responses } = state;

  const onSelectedRowsChange = (selectedRows: ReadonlySet<string>) => {
    dispatch({
      type: "editor/response/select",
      selection: selectedRows,
    });
  };

  const onColumnsReorder = (sourceKey: string, targetKey: string) => {
    // FIXME: the reorder won't work. we are using custom header cell, which needs a custom dnd handling.
    dispatch({
      type: "editor/data-grid/column/reorder",
      a: sourceKey,
      b: targetKey,
    });
  };

  const __id_column: Column<GFResponseRow> = {
    key: "__gf_display_id",
    name: "id",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: GFSystemPropertyHeaderCell,
  };

  const __created_at_column: Column<GFResponseRow> = {
    key: "__gf_created_at",
    name: "time",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: GFSystemPropertyHeaderCell,
    renderCell: DefaultPropertyDateCell,
  };

  const __customer_uuid_column: Column<GFResponseRow> = {
    key: "__gf_customer_id",
    name: "customer",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: GFSystemPropertyHeaderCell,
    renderCell: DefaultPropertyCustomerCell,
  };

  const __new_column: Column<GFResponseRow> = {
    key: "__gf_new",
    name: "+",
    resizable: false,
    draggable: true,
    width: 100,
    renderHeaderCell: (props) => (
      <NewFieldHeaderCell {...props} onClick={onAddNewFieldClick} />
    ),
  };

  const systemcolumns = _systemcolumns.map((c) => {
    switch (c.key) {
      case "__gf_display_id":
        return {
          ...__id_column,
          // name for display id can be customized
          name: c.name || __id_column.name,
        };
      case "__gf_created_at":
        return __created_at_column;
      case "__gf_customer_id":
        return __customer_uuid_column;
    }
  });

  const allcolumns = systemcolumns
    .concat(
      columns.map(
        (col) =>
          ({
            key: col.key,
            name: col.name,
            resizable: true,
            draggable: true,
            editable: true,
            minWidth: 140,
            maxWidth: 640,
            width: undefined,
            renderHeaderCell: (props) => (
              <FieldHeaderCell
                {...props}
                type={col.type as FormInputType}
                onEditClick={() => {
                  onEditFieldClick?.(col.key);
                }}
                onDeleteClick={() => {
                  onDeleteFieldClick?.(col.key);
                }}
              />
            ),
            renderCell: FieldCell,
            renderEditCell:
              !readonly && !col.readonly ? FieldEditCell : undefined,
          }) as Column<any>
      )
    )
    .concat(__new_column);

  if (!selectionDisabled) {
    allcolumns.unshift(SelectColumn);
  }

  const onCopy = (e: CopyEvent<GFResponseRow>) => {
    console.log(e);
    let val: string | undefined;
    if (e.sourceColumnKey.startsWith("__gf_")) {
      // copy value as is
      val = (e.sourceRow as any)[e.sourceColumnKey];
    } else {
      // copy value from fields
      const field = e.sourceRow.fields[e.sourceColumnKey];
      const value = field.value;
      val = unwrapFeildValue(value, field.type as FormInputType)?.toString();
    }

    if (val) {
      // copy to clipboard
      const cp = navigator.clipboard.writeText(val);
      toast.promise(cp, {
        loading: "Copying to clipboard...",
        success: "Copied to clipboard",
        error: "Failed to copy to clipboard",
      });
    }
  };

  return (
    <DataGrid
      className="flex-grow select-none"
      rowKeyGetter={rowKeyGetter}
      columns={allcolumns}
      onColumnsReorder={onColumnsReorder}
      selectedRows={selectionDisabled ? undefined : selected_responses}
      onCopy={onCopy}
      onRowsChange={(rows, data) => {
        const key = data.column.key;
        const indexes = data.indexes;

        for (const i of indexes) {
          const row = rows[i];
          const field = row.fields[key];

          onCellChange?.(row, key, field);
        }
      }}
      onSelectedRowsChange={
        selectionDisabled ? undefined : onSelectedRowsChange
      }
      renderers={{ noRowsFallback: <EmptyRowsRenderer loading={loading} /> }}
      rows={rows}
      rowHeight={44}
    />
  );
}

function GFSystemPropertyHeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <div className="flex items-center gap-2">
      <DefaultPropertyIcon __key={key as GFSystemColumnTypes} />
      <span className="font-normal">{name}</span>
    </div>
  );
}

function DefaultPropertyIcon({ __key: key }: { __key: GFSystemColumnTypes }) {
  switch (key) {
    case "__gf_display_id":
      return <Link2Icon className="min-w-4" />;
    case "__gf_created_at":
      return <CalendarIcon className="min-w-4" />;
    case "__gf_customer_id":
      return <AvatarIcon className="min-w-4" />;
  }
}

function FieldHeaderCell({
  column,
  type,
  onEditClick,
  onDeleteClick,
}: RenderHeaderCellProps<any> & {
  type: FormInputType;
  onEditClick?: () => void;
  onDeleteClick?: () => void;
}) {
  const { name } = column;

  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <FormFieldTypeIcon type={type} className="w-4 h-4" />
        <span className="font-normal">{name}</span>
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button>
            <ChevronDownIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent className="z-50">
            <DropdownMenuItem onClick={onEditClick}>
              <Pencil1Icon className="me-2 align-middle" />
              Edit Field
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDeleteClick}>
              <TrashIcon className="me-2 align-middle" />
              Delete Field
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    </div>
  );
}

function NewFieldHeaderCell({
  onClick,
}: RenderHeaderCellProps<any> & {
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full h-full flex items-center justify-center"
    >
      <PlusIcon />
    </button>
  );
}

function DefaultPropertyDateCell({
  column,
  row,
}: RenderCellProps<GFResponseRow>) {
  const [state] = useEditorState();

  const date = row.__gf_created_at;

  const { dateformat, datetz } = state;

  if (!date) {
    return <></>;
  }

  return <>{fmtdate(date, dateformat, tztostr(datetz))}</>;
}

function fmtdatetimelocal(date: Date | string) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function fmtdate(
  date: Date | string,
  format: "date" | "time" | "datetime",
  tz?: string
) {
  if (typeof date === "string") {
    date = new Date(date);
  }

  if (tz) {
    date = toZonedTime(date, tz);
  }

  switch (format) {
    case "date":
      return date.toLocaleDateString();
    case "time":
      return date.toLocaleTimeString();
    case "datetime":
      return date.toLocaleString();
  }
}

function DefaultPropertyCustomerCell({
  column,
  row,
}: RenderCellProps<GFResponseRow>) {
  const [state, dispatch] = useEditorState();

  const data = row.__gf_customer_id;

  if (!data) {
    return <></>;
  }

  return (
    <div className="w-full flex justify-between">
      <span className="font-mono text-ellipsis flex-1 overflow-hidden">
        {data}
      </span>
      <FKButton
        onClick={() => {
          dispatch({
            type: "editor/customers/edit",
            open: true,
            customer_id: data,
          });
        }}
      />
    </div>
  );
}

function FKButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="outline" className="m-1 p-2" onClick={onClick}>
      <ArrowRightIcon className="w-3 h-3" />
    </Button>
  );
}

function FieldCell({ column, row }: RenderCellProps<GFResponseRow>) {
  const [state] = useEditorState();

  const { datagrid_filter } = state;

  const data = row.fields[column.key];

  if (!data) {
    return <></>;
  }

  const { type, value, options, files } = data;

  const unwrapped = unwrapFeildValue(
    FormValue.parse(value, {
      type,
      enums: options
        ? Object.keys(options).map((key) => ({
            id: key,
            value: options[key].value,
          }))
        : [],
    }).value,
    type as FormInputType
  );

  if (
    !FieldSupports.file_alias(type) &&
    (unwrapped === null || unwrapped === "" || unwrapped === undefined)
  ) {
    return (
      <span className="text-muted-foreground/50">
        <Empty value={unwrapped} />
      </span>
    );
  }

  switch (type as FormInputType) {
    case "switch":
    case "checkbox": {
      return <input type="checkbox" checked={unwrapped as boolean} disabled />;
    }
    case "color": {
      return (
        <div className="w-full h-full p-2 flex gap-2 items-center">
          <div
            className="aspect-square min-w-4 rounded bg-neutral-500 border border-ring"
            style={{ backgroundColor: unwrapped as string }}
          />
          <span>
            <Highlight
              text={unwrapped?.toString()}
              tokens={datagrid_filter.localsearch}
              className="bg-foreground text-background"
            />
          </span>
        </div>
      );
    }
    case "video":
    case "audio":
    case "file": {
      return (
        <div className="w-full h-full flex gap-2">
          {files?.map((f, i) => (
            <span key={i}>
              <FileTypeIcon
                type={type as "file"}
                className="inline w-4 h-4 align-middle me-2"
              />
              <span>
                <Highlight
                  text={f.name}
                  tokens={datagrid_filter.localsearch}
                  className="bg-foreground text-background"
                />
              </span>
            </span>
          ))}
        </div>
      );
    }
    case "image": {
      return (
        <div className="w-full h-full flex gap-2">
          {files?.map((file, i) => (
            <figure className="py-1 flex items-center gap-2" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.src}
                alt={file.name}
                className="h-full min-w-10 aspect-square rounded overflow-hidden object-cover bg-neutral-500"
                loading="lazy"
              />
              {/* <figcaption>{file.name}</figcaption> */}
            </figure>
          ))}
        </div>
      );
    }
    case "richtext": {
      if (unwrapped === null || unwrapped === "" || unwrapped === undefined) {
        return (
          <span className="text-muted-foreground/50">
            <Empty value={unwrapped} />
          </span>
        );
      }

      return (
        <div>
          <FileTypeIcon
            type="richtext"
            className="inline w-4 h-4 align-middle me-2"
          />{" "}
          DOCUMENT
        </div>
      );
    }
    case "datetime-local": {
      return (
        <div>
          {fmtdate(unwrapped as string, "datetime", tztostr(state.datetz))}
        </div>
      );
    }
    default:
      const display =
        state.datagrid_filter.masking_enabled && typeof unwrapped === "string"
          ? mask(unwrapped)
          : unwrapped?.toString();
      return (
        <div>
          <Highlight
            text={display}
            tokens={datagrid_filter.localsearch}
            className="bg-foreground text-background"
          />
        </div>
      );
  }
}

function FieldEditCell(props: RenderEditCellProps<GFResponseRow>) {
  const { column, row } = props;
  const data = row.fields[column.key];
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const wasEscPressed = useRef(false);

  useEffect(() => {
    if (ref.current) {
      // focus & select all
      ref.current.focus();
      ref.current.select();
    }
  }, [ref]);

  const { type, value, option_id, multiple, options, files } = data ?? {};

  const onKeydown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter") {
      const val = ref.current?.value;
      onCommit(e);
    }
    if (e.key === "Escape") {
      wasEscPressed.current = true;
    }
  };

  const onBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!wasEscPressed.current) {
      onCommit(e);
    } else {
      wasEscPressed.current = false;
    }
  };

  const commit = (change: { value: any; option_id?: string }) => {
    props.onRowChange(
      {
        ...row,
        fields: {
          ...row.fields,
          [column.key]: {
            ...data,
            value: change.value,
            option_id: change.option_id,
          },
        },
      },
      true
    );
  };

  const onCommit = (
    e:
      | React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
      | React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    let val: any = ref.current?.value;
    switch (e.currentTarget.type) {
      case "checkbox": {
        val = (e.currentTarget as HTMLInputElement).checked;
        break;
      }
      case "number":
        val = parseFloat(val);
        break;
      case "datetime-local": {
        try {
          const date = new Date(val);
          val = date.toISOString();
        } catch (e) {
          // when user leaves the field empty
          return;
        }
      }
    }

    commit({ value: val });
  };

  try {
    const unwrapped = unwrapFeildValue(value, type);

    if (!FieldSupports.file_alias(type) && unwrapped === undefined) {
      console.log("unwrapped", unwrapped);
      return <NotSupportedEditCell />;
    }

    switch (type as FormInputType) {
      case "email":
      case "password":
      case "tel":
      case "url":
      case "text":
      case "hidden": {
        return (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type={type === "hidden" ? "text" : type}
            className="w-full px-2 appearance-none outline-none border-none"
            defaultValue={unwrapped as string}
            onKeyDown={onKeydown}
            onBlur={onBlur}
          />
        );
      }
      case "textarea": {
        return (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            className="w-full px-2 appearance-none outline-none border-none"
            defaultValue={unwrapped as string}
            onKeyDown={onKeydown}
            onBlur={onBlur}
          />
        );
      }
      case "range":
      case "number": {
        return (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            className="w-full px-2 appearance-none outline-none border-none"
            type="number"
            defaultValue={unwrapped as string | number}
            onKeyDown={onKeydown}
            onBlur={onBlur}
          />
        );
      }
      case "datetime-local": {
        return (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type={type}
            className="w-full px-2 appearance-none outline-none border-none"
            defaultValue={
              unwrapped ? fmtdatetimelocal(unwrapped as string) : undefined
            }
            onKeyDown={onKeydown}
            onBlur={onBlur}
          />
        );
      }
      case "date":
      case "time":
      case "month":
      case "week": {
        return (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type={type}
            className="w-full px-2 appearance-none outline-none border-none"
            defaultValue={unwrapped as string}
            onKeyDown={onKeydown}
            onBlur={onBlur}
          />
        );
      }
      case "color":
        return (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type="color"
            className="w-full px-2 appearance-none outline-none border-none"
            defaultValue={unwrapped as string}
            onKeyDown={onKeydown}
            onBlur={onBlur}
          />
        );
      case "file":
      case "audio":
      case "video":
      case "image": {
        return (
          <FileEditCell
            type={type as "file" | "image" | "audio" | "video"}
            multiple={multiple}
            files={files || []}
          />
        );
      }
      case "richtext": {
        return (
          <RichTextEditCell
            row_id={row.__gf_id}
            field_id={column.key}
            defaultValue={unwrapped}
            onValueCommit={(v) => {
              commit({ value: v });
            }}
          />
        );
      }
      case "switch":
      case "checkbox": {
        return (
          <div className="px-2 w-full h-full flex justify-between items-center">
            <input
              ref={ref as React.RefObject<HTMLInputElement>}
              type="checkbox"
              defaultChecked={unwrapped === true}
              onKeyDown={onKeydown}
              onBlur={onBlur}
            />
          </div>
        );
      }
      case "radio":
      case "select":
        return (
          <Select
            defaultValue={option_id ?? undefined}
            onValueChange={(v) => {
              commit({ value: options?.[v]?.value, option_id: v });
            }}
          >
            <SelectTrigger>
              <SelectValue className="w-full h-full m-0" placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {options &&
                Object.keys(options)?.map((key, i) => {
                  const opt = options[key];
                  return (
                    <SelectItem key={key} value={key}>
                      {opt.value}{" "}
                      <small className="text-muted-foreground">
                        {opt.label || opt.value}
                      </small>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        );
      // not supported
      case "checkboxes":
      case "signature":
      case "payment":
      default:
        return <NotSupportedEditCell />;
    }
  } catch (e) {
    console.error(e);
    return <JsonEditCell {...props} />;
  }
}

function NotSupportedEditCell() {
  return (
    <div className="px-2 w-full text-muted-foreground">
      This field can&apos;t be edited
    </div>
  );
}

function Empty({ value }: { value?: null | undefined | "" }) {
  if (value === null) {
    return <>NULL</>;
  }
  if (value === "") {
    return <>EMPTY</>;
  }
  if (value === undefined) {
    return <>UNDEFINED</>;
  }
  return <></>;
}
