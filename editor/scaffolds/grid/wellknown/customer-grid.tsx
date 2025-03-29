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
import { PhoneIcon, TagIcon } from "lucide-react";
import { mask } from "../grid-text-mask";
import Highlight from "@/components/highlight";
import { CellRoot } from "../cells";
import { DataFormat } from "@/scaffolds/data-format";
import { Platform } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import { SelectColumn } from "../columns";
import { StandaloneDataGridStateProvider } from "../providers";
import "../grid.css";

const column_keys: (Platform.Customer.Property & {
  key: keyof DGCustomerRow;
  name: string;
  width?: number;
  frozen?: boolean;
  sensitive?: boolean;
})[] = [
  {
    key: "name",
    name: "Name",
    frozen: true,
    sensitive: true,
    width: 200,
    ...Platform.Customer.properties["name"],
  },
  {
    key: "email",
    name: "Email",
    sensitive: true,
    ...Platform.Customer.properties["email"],
  },
  {
    key: "phone",
    name: "Phone",
    sensitive: true,
    ...Platform.Customer.properties["phone"],
  },
  {
    key: "tags",
    name: "Tags",
    sensitive: false,
    ...Platform.Customer.properties["tags"],
  },
  {
    key: "created_at",
    name: "Created",
    sensitive: false,
    ...Platform.Customer.properties["created_at"],
  },
  {
    key: "last_seen_at",
    name: "Last Seen",
    sensitive: false,
    ...Platform.Customer.properties["last_seen_at"],
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
  const columns = column_keys.map(
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

          if (col.type === "array") {
            return (
              <CellRoot className="flex items-center gap-1">
                {(val as string[]).map((v, i) => (
                  <Badge key={v} variant="outline">
                    {v}
                  </Badge>
                ))}
              </CellRoot>
            );
          } else {
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
          }
        },
      }) as Column<any>
  );

  columns.unshift(SelectColumn);

  const rows: DGCustomerRow[] = _rows.map((row) => {
    return Object.keys(row).reduce((acc, k) => {
      const val = row[k as keyof DGCustomerRow];

      if (Array.isArray(val)) {
        return { ...acc, [k]: val };
      }

      if (val !== null && typeof val === "object") {
        return { ...acc, [k]: JSON.stringify(val) };
      }

      return { ...acc, [k]: val };
    }, {}) as DGCustomerRow;
  });

  return (
    <StandaloneDataGridStateProvider>
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
    </StandaloneDataGridStateProvider>
  );
}

function HeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <CellRoot className="flex items-center gap-1.5">
      <CustomerPropertyIcon property={key as any} className="size-3.5" />
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
    case "tags":
      return <TagIcon {...props} />;
    case "created_at":
    case "last_seen_at":
      return <CalendarIcon {...props} />;
    default:
      return <></>;
  }
}
