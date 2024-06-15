"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import DataGrid, {
  Column,
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
import { FormInputType, FormResponseField } from "@/types";
import { JsonEditCell } from "./json-cell";
import { useEditorState } from "../editor";
import { GFRow } from "./types";
import { SelectColumn } from "./select-column";
import "./grid.css";
import { unwrapFeildValue } from "@/lib/forms/unwrap";
import { Button } from "@/components/ui/button";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import { createClientFormsClient } from "@/lib/supabase/client";
import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { toZonedTime } from "date-fns-tz";
import { tztostr } from "../editor/symbols";
import { mask } from "./mask";
function rowKeyGetter(row: GFRow) {
  return row.__gf_id;
}

export function Grid({
  columns,
  rows,
  selectionDisabled,
  readonly,
  onAddNewFieldClick,
  onEditFieldClick,
  onDeleteFieldClick,
}: {
  columns: {
    key: string;
    name: string;
    type?: string;
  }[];
  rows: GFRow[];
  selectionDisabled?: boolean;
  readonly?: boolean;
  onAddNewFieldClick?: () => void;
  onEditFieldClick?: (id: string) => void;
  onDeleteFieldClick?: (id: string) => void;
}) {
  const [state, dispatch] = useEditorState();
  const { selected_responses } = state;

  const onSelectedRowsChange = (selectedRows: ReadonlySet<string>) => {
    dispatch({
      type: "editor/response/select",
      selection: selectedRows,
    });
  };

  const __id_column: Column<any> = {
    key: "__gf_display_id",
    name: "id",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: DefaultPropertyHeaderCell,
  };

  const __created_at_column: Column<any> = {
    key: "__gf_created_at",
    name: "time",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: DefaultPropertyHeaderCell,
    renderCell: DefaultPropertyDateCell,
  };

  const __customer_uuid_column: Column<any> = {
    key: "__gf_customer_uuid",
    name: "customer",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: DefaultPropertyHeaderCell,
    renderCell: DefaultPropertyCustomerCell,
  };

  const __new_column: Column<any> = {
    key: "__gf_new",
    name: "+",
    resizable: false,
    draggable: true,
    width: 100,
    renderHeaderCell: (props) => (
      <NewFieldHeaderCell {...props} onClick={onAddNewFieldClick} />
    ),
  };

  const formattedColumns = [
    __id_column,
    __created_at_column,
    __customer_uuid_column,
  ]
    .concat(
      columns.map(
        (col) =>
          ({
            key: col.key,
            name: col.name,
            resizable: true,
            draggable: true,
            editable: true,
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
            renderEditCell: !readonly ? FieldEditCell : undefined,
          }) as Column<any>
      )
    )
    .concat(__new_column);

  if (!selectionDisabled) {
    formattedColumns.unshift(SelectColumn);
  }

  return (
    <DataGrid
      className="flex-grow border border-neutral-200 dark:border-neutral-900 select-none"
      rowKeyGetter={rowKeyGetter}
      columns={formattedColumns}
      selectedRows={selectionDisabled ? undefined : selected_responses}
      onSelectedRowsChange={
        selectionDisabled ? undefined : onSelectedRowsChange
      }
      rows={rows}
      rowHeight={44}
    />
  );
}

function LeadingHeaderCell({ column }: RenderHeaderCellProps<any>) {
  return <div></div>;
}

function LeadingCell({ column }: RenderCellProps<any>) {
  return (
    <div className="flex group items-center justify-between h-full w-full">
      <input type="checkbox" />
      <button className="opacity-0 group-hover:opacity-100">
        <EnterFullScreenIcon />
      </button>
    </div>
  );
}

function DefaultPropertyHeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <div className="flex items-center gap-2">
      <DefaultPropertyIcon __key={key} />
      <span className="font-normal">{name}</span>
    </div>
  );
}

function DefaultPropertyIcon({ __key: key }: { __key: string }) {
  switch (key) {
    case "__gf_id":
    case "__gf_display_id":
      return <Link2Icon className="min-w-4" />;
    case "__gf_created_at":
      return <CalendarIcon className="min-w-4" />;
    case "__gf_customer_uuid":
    case "__gf_customer":
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
        <FormFieldTypeIcon type={type} />
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
      className="rounded p-2 bg-neutral-100 dark:bg-neutral-900 w-full flex items-center justify-center"
    >
      <PlusIcon />
    </button>
  );
}

function DefaultPropertyDateCell({ column, row }: RenderCellProps<GFRow>) {
  const [state] = useEditorState();

  const date = row.__gf_created_at;

  const { dateformat, datetz } = state;

  if (!date) {
    return <></>;
  }

  return <>{fmtdate(date, dateformat, tztostr(datetz))}</>;
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

function DefaultPropertyCustomerCell({ column, row }: RenderCellProps<GFRow>) {
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

function FieldCell({ column, row }: RenderCellProps<GFRow>) {
  const [state] = useEditorState();
  const data = row.fields[column.key];

  if (!data) {
    return <></>;
  }

  const { type, value, files } = data;

  const unwrapped = unwrapFeildValue(value, type as FormInputType);

  switch (type as FormInputType) {
    case "switch":
    case "checkbox": {
      return <input type="checkbox" checked={unwrapped as boolean} disabled />;
    }
    case "file": {
      return (
        <div className="w-full h-full flex gap-2">
          {files?.map((f, i) => (
            <span key={i}>
              <FileIcon className="inline w-4 h-4 align-middle me-2" />
              {f.name}
            </span>
          ))}
        </div>
      );
    }
    case "image": {
      return (
        <div className="w-full h-full flex gap-2">
          {files?.map((file, i) => (
            <figure className="p-1 flex items-center gap-2" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.src}
                alt={file.name}
                className="h-full min-w-10 aspect-square rounded overflow-hidden object-cover bg-neutral-500"
              />
              <figcaption>{file.name}</figcaption>
            </figure>
          ))}
        </div>
      );
    }
    default:
      return (
        <div>
          {state.datagrid_filter.masking_enabled &&
          typeof unwrapped === "string"
            ? mask(unwrapped)
            : unwrapped}
        </div>
      );
  }
}

function FieldEditCell(props: RenderEditCellProps<GFRow>) {
  const { column, row } = props;
  const data = row.fields[column.key];
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      // focus & select all
      ref.current.focus();
      ref.current.select();
    }
  }, [ref]);

  if (!data) {
    return <></>;
  }

  const { type, value, files } = data;

  try {
    // FIXME: need investigation (case:FIELDVAL)
    const unwrapped = JSON.parse(value);
    switch (type as FormInputType) {
      case "email":
      case "password":
      case "tel":
      case "textarea":
      case "url":
      case "text":
        return (
          <input
            ref={ref}
            readOnly
            className="w-full px-2 appearance-none outline-none border-none"
            type="text"
            defaultValue={unwrapped}
          />
        );
      case "select":
        return <JsonEditCell {...props} />;
      case "color":
        return (
          <input readOnly disabled type="color" defaultValue={unwrapped} />
        );
      case "checkbox":
      case "file":
      case "image": {
        return (
          <div>
            {files?.map((f, i) => (
              <a
                key={i}
                href={f.download}
                target="_blank"
                rel="noreferrer"
                download
              >
                <Button variant="link" size="sm">
                  <DownloadIcon className="me-2 align-middle" />
                  Download {f.name}
                </Button>
              </a>
            ))}
          </div>
        );
      }
      // return (
      //   <input readOnly disabled type="checkbox" defaultChecked={unwrapped} />
      // );
      default:
        return <JsonEditCell {...props} />;
    }
  } catch (e) {
    return <JsonEditCell {...props} />;
  }
}
