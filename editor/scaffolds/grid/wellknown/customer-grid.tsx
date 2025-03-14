"use client";

import React from "react";
import DataGrid, {
  Column,
  RenderCellProps,
  RenderHeaderCellProps,
} from "react-data-grid";
import { DGCustomerRow } from "../types";
import { EmptyRowsRenderer } from "../grid-empty-state";
import {
  AvatarIcon,
  CalendarIcon,
  EnvelopeClosedIcon,
} from "@radix-ui/react-icons";
import { PhoneIcon } from "lucide-react";
import { mask } from "../grid-text-mask";
import Highlight from "@/components/highlight";
import { CellRoot } from "../cells";
import { DataFormat } from "@/scaffolds/data-format";
import "../grid.css";

const customer_columns = [
  {
    key: "uid",
    name: "ID",
    width: 64,
    frozen: true,
    sensitive: true,
    format: "uuid" as DataFormat.Format,
  },
  {
    key: "name",
    name: "Name",
    frozen: true,
    sensitive: true,
  },
  {
    key: "email",
    name: "Email",
    sensitive: true,
    format: "email" as DataFormat.Format,
  },
  {
    key: "phone",
    name: "Phone",
    sensitive: true,
  },
  {
    key: "created_at",
    name: "Created At",
    sensitive: false,
    format: "timestamptz" as DataFormat.Format,
  },
  {
    key: "last_seen_at",
    name: "Last Seen At",
    sensitive: false,
    format: "timestamptz" as DataFormat.Format,
  },
];

export function CustomerGrid({
  rows: _rows,
  tokens,
  masked,
  loading,
  dateformat = "datetime",
  datetz,
  onCellDoubleClick,
}: {
  rows: DGCustomerRow[];
  tokens?: string[];
  masked?: boolean;
  datetz?: DataFormat.DateTZ;
  dateformat?: DataFormat.DateFormat;
  loading?: boolean;
  onCellDoubleClick?: (row: DGCustomerRow, column: string) => void;
}) {
  const columns = customer_columns.map(
    (col) =>
      ({
        key: col.key,
        name: col.name,
        resizable: true,
        draggable: true,
        editable: false,
        frozen: col.frozen,
        width: col.width,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, column }: RenderCellProps<any>) => {
          const val = row[col.key as keyof DGCustomerRow];
          const nonnull = val ?? "—";

          let display = nonnull.toString();

          if (masked && col.sensitive) {
            display = mask(display);
          } else if (col.format === "timestamptz") {
            display = DataFormat.fmtdate(display, dateformat, datetz);
          }

          return (
            <CellRoot>
              <Highlight
                text={display}
                tokens={tokens}
                highlightClassName="bg-foreground text-background"
              />
            </CellRoot>
          );
        },
      }) as Column<any>
  );

  const rows: DGCustomerRow[] = _rows.map((row) => {
    return Object.keys(row).reduce((acc, k) => {
      const val = row[k as keyof DGCustomerRow];
      if (val !== null && typeof val === "object") {
        return { ...acc, [k]: JSON.stringify(val) };
      }

      return { ...acc, [k]: val };
    }, {}) as DGCustomerRow;
  });

  return (
    <DataGrid<DGCustomerRow>
      className="flex-grow select-none text-xs text-foreground/80"
      columns={columns}
      rows={rows}
      renderers={{ noRowsFallback: <EmptyRowsRenderer loading={loading} /> }}
      rowKeyGetter={(row) => (row as DGCustomerRow)["uid"]}
      onCellDoubleClick={({ row, column }) => {
        onCellDoubleClick?.(row, column.key);
      }}
      rowHeight={32}
      headerRowHeight={36}
    />
  );
}

function HeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <CellRoot className="flex items-center gap-1.5">
      <CustomerPropertyIcon property={key as any} className="w-4 h-4" />
      <span className="font-normal">{name}</span>
    </CellRoot>
  );
}

function CustomerPropertyIcon({
  property,
  className,
}: {
  property: keyof DGCustomerRow;
  className?: string;
}) {
  const props = {
    className: className,
  };
  switch (property) {
    case "name":
      return <AvatarIcon {...props} />;
    case "email":
      return <EnvelopeClosedIcon {...props} />;
    case "phone":
      return <PhoneIcon {...props} />;
    case "created_at":
    case "last_seen_at":
      return <CalendarIcon {...props} />;
    default:
      return <></>;
  }
}
