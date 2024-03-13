"use client";

import "react-data-grid/lib/styles.css";
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
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";

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
  rows: { __id: string; [key: string]: string | number | boolean }[];
  onAddNewFieldClick?: () => void;
  onEditFieldClick?: (id: string) => void;
  onDeleteFieldClick?: (id: string) => void;
}) {
  const __leading_column: Column<any> = {
    key: "__",
    name: "",
    frozen: true,
    width: 50,
    renderHeaderCell: LeadingHeaderCell,
    renderCell: LeadingCell,
  };

  const __id_column: Column<any> = {
    key: "__gf_id",
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

  const formattedColumns = [__leading_column, __id_column, __created_at_column]
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
      className="border border-gray-200 h-max select-none"
      columns={formattedColumns}
      rows={rows}
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
      return <Link2Icon />;
    case "__gf_created_at":
      return <CalendarIcon />;
  }
}

function FieldHeaderCell({
  column,
  onEditClick,
  onDeleteClick,
}: RenderHeaderCellProps<any> & {
  onEditClick?: () => void;
  onDeleteClick?: () => void;
}) {
  const { name } = column;

  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <TextIcon />
        <span className="font-normal">{name}</span>
      </span>
      <DropdownMenu>
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

function NewFieldHeaderCell({
  onClick,
}: RenderHeaderCellProps<any> & {
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded p-2 bg-neutral-100 w-full flex items-center justify-center"
    >
      <PlusIcon />
    </button>
  );
}

function FieldCell({ column, row }: RenderCellProps<any>) {
  const data = row[column.key];

  if (!data) {
    return <></>;
  }

  const { type, value } = data;

  const unwrapped = JSON.parse(value);

  let display = "";
  switch (type) {
    case "text":
      display = unwrapped;
      break;
  }

  return <div>{unwrapped}</div>;
}

function FieldEditCell({ column, row }: RenderEditCellProps<any>) {
  const data = row[column.key];

  if (!data) {
    return <></>;
  }

  const { type, value } = data;

  const unwrapped = JSON.parse(value);

  switch (type) {
    case "text":
      return <input type="text" defaultValue={unwrapped} />;
    case "select":
      return <select></select>;
  }
}
