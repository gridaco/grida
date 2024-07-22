"use client";

import React from "react";
import DataGrid, {
  Column,
  RenderCellProps,
  RenderHeaderCellProps,
} from "react-data-grid";
import { CFCustomerRow } from "./types";
import { EmptyRowsRenderer } from "./empty";
import "./grid.css";
import { CalendarIcon, EnvelopeClosedIcon } from "@radix-ui/react-icons";
import { PhoneIcon } from "lucide-react";
import { mask } from "./mask";
import Highlight from "@/components/highlight";

export function CustomerGrid({
  rows: _rows,
  rowKey,
  onSelected,
  tokens,
  masked,
}: {
  rows: CFCustomerRow[];
  rowKey?: string;
  tokens?: string[];
  masked?: boolean;
  onSelected?: (key: string, row: CFCustomerRow) => void;
}) {
  const columns = [
    {
      key: "uid",
      name: "ID",
    },
    {
      key: "email",
      name: "Email",
    },
    {
      key: "phone",
      name: "Phone",
    },
    {
      key: "created_at",
      name: "Created At",
    },
    {
      key: "last_seen_at",
      name: "Last Seen At",
    },
  ].map(
    (col) =>
      ({
        key: col.key,
        name: col.name,
        resizable: true,
        draggable: true,
        editable: false,
        // frozen: col.key === rowKey,
        width: undefined,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, column }: RenderCellProps<any>) => {
          const val = row[col.key as keyof CFCustomerRow];
          const display = masked
            ? val
              ? mask(val.toString())
              : ""
            : val?.toString();

          return (
            <Highlight
              text={display}
              tokens={tokens}
              className="bg-foreground text-background"
            />
          );
        },
      }) as Column<any>
  );

  const rows = _rows.map((row) => {
    return Object.keys(row).reduce((acc, k) => {
      const val = row[k as keyof CFCustomerRow];
      if (typeof val === "object") {
        return { ...acc, [k]: JSON.stringify(val) };
      }

      return { ...acc, [k]: val };
    }, {});
  });

  return (
    <DataGrid
      className="flex-grow select-none"
      columns={columns}
      rows={rows}
      renderers={{ noRowsFallback: <EmptyRowsRenderer /> }}
      rowKeyGetter={rowKey ? (row) => (row as any)[rowKey] : undefined}
      rowHeight={44}
    />
  );
}

function HeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <div className="flex items-center gap-2">
      <CustomerPropertyIcon property={key as any} className="w-4 h-4" />
      <span className="font-normal">{name}</span>
    </div>
  );
}

function CustomerPropertyIcon({
  property,
  className,
}: {
  property: "email" | "phone" | "created_at" | "last_seen_at";
  className?: string;
}) {
  const props = {
    className: className,
  };
  switch (property) {
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
