"use client";

import React, { useEffect, useRef, useState } from "react";
import DataGrid, {
  Column,
  RenderCellProps,
  RenderEditCellProps,
  RenderHeaderCellProps,
} from "react-data-grid";
import {
  PlusIcon,
  ChevronDownIcon,
  EnvelopeClosedIcon,
  TextIcon,
  ImageIcon,
  EnterFullScreenIcon,
  CalendarIcon,
  Link2Icon,
  Pencil1Icon,
  TrashIcon,
  GlobeIcon,
  DropdownMenuIcon,
  CheckCircledIcon,
  EyeClosedIcon,
  ColorWheelIcon,
  AvatarIcon,
  RadiobuttonIcon,
  ArrowRightIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";
import { FormFieldType } from "@/types";
import { JsonEditCell } from "./json-cell";
import { useEditorState } from "../editor";
import { GFRow } from "./types";
import { SelectColumn } from "./select-column";
import "./grid.css";
import { unwrapFeildValue } from "@/lib/forms/unwrap";
import { Button } from "@/components/ui/button";

function rowKeyGetter(row: GFRow) {
  return row.__gf_id;
}

export function Grid({
  columns,
  rows,
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
    key: "__gf_local_id",
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
  };

  const __customer_uuid_column: Column<any> = {
    key: "__gf_customer_uuid",
    name: "customer",
    frozen: true,
    resizable: true,
    width: 100,
    renderHeaderCell: DefaultPropertyHeaderCell,
    renderCell: CustomerCell,
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
    SelectColumn,
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
                type={col.type as FormFieldType}
                onEditClick={() => {
                  onEditFieldClick?.(col.key);
                }}
                onDeleteClick={() => {
                  onDeleteFieldClick?.(col.key);
                }}
              />
            ),
            renderCell: FieldCell,
            renderEditCell: FieldEditCell,
          }) as Column<any>
      )
    )
    .concat(__new_column);

  return (
    <DataGrid
      className="flex-grow border border-neutral-200 dark:border-neutral-900 select-none"
      rowKeyGetter={rowKeyGetter}
      columns={formattedColumns}
      selectedRows={selected_responses}
      onSelectedRowsChange={onSelectedRowsChange}
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
    case "__gf_local_id":
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
  type: FormFieldType;
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
              <Pencil1Icon />
              Edit Field
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDeleteClick}>
              <TrashIcon />
              Delete Field
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    </div>
  );
}

function FormFieldTypeIcon({ type }: { type: FormFieldType }) {
  switch (type) {
    case "text":
      return <TextIcon />;
    case "tel":
    case "email":
      return <EnvelopeClosedIcon />;
    case "radio":
      return <RadiobuttonIcon />;
    case "select":
      return <DropdownMenuIcon />;
    case "url":
      return <GlobeIcon />;
    case "image":
      return <ImageIcon />;
    case "checkbox":
      return <CheckCircledIcon />;
    case "date":
    case "month":
    case "week":
      return <CalendarIcon />;
    case "password":
      return <EyeClosedIcon />;
    case "color":
      return <ColorWheelIcon />;
    case "hidden":
      return <EyeClosedIcon />;
    case "signature":
      // TODO: replace icon
      return <>✍️</>;
    case "payment":
      // TODO: replace icon
      return <>💰</>;
    default:
      return <TextIcon />;
  }
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

function CustomerCell({ column, row }: RenderCellProps<any>) {
  const [state, dispatch] = useEditorState();

  const data = row[column.key];

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

function FieldCell({ column, row }: RenderCellProps<any>) {
  const data = row[column.key];

  if (!data) {
    return <></>;
  }

  const { type, value } = data;

  const unwrapped = unwrapFeildValue(value, type as FormFieldType, {
    obscure: true,
  });

  switch (type as FormFieldType) {
    case "checkbox": {
      return <input type="checkbox" checked={unwrapped as boolean} disabled />;
    }
    default:
      return <div>{unwrapped}</div>;
  }
}

function FieldEditCell(props: RenderEditCellProps<any>) {
  const { column, row } = props;
  const data = row[column.key];
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

  const { type, value } = data;

  const unwrapped = JSON.parse(value);

  switch (type as FormFieldType) {
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
      return <input readOnly disabled type="color" defaultValue={unwrapped} />;
    case "checkbox":
    // return (
    //   <input readOnly disabled type="checkbox" defaultChecked={unwrapped} />
    // );
    default:
      return <JsonEditCell {...props} />;
  }
}
