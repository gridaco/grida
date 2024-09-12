"use client";

import React from "react";
import DataGrid, { Column, RenderCellProps } from "react-data-grid";
import { XSupabaseReferenceTableRow } from "./types";
import { EmptyRowsRenderer } from "./empty";
import Highlight from "@/components/highlight";
import "./grid.css";
import { mask } from "./mask";

export function ReferenceTableGrid({
  columns: _columns,
  rows: _rows,
  rowKey,
  tokens,
  masked,
  loading,
  onSelected,
}: {
  columns: {
    key: string;
    name: string;
    type?: string;
  }[];
  rows: XSupabaseReferenceTableRow[];
  rowKey?: string;
  tokens?: string[];
  masked?: boolean;
  loading?: boolean;
  onSelected?: (key: string, row: XSupabaseReferenceTableRow) => void;
}) {
  const columns = _columns.map(
    (col) =>
      ({
        key: col.key,
        name: col.name,
        resizable: true,
        draggable: true,
        editable: false,
        // frozen: col.key === rowKey,
        width: undefined,
        renderCell: ({ row, column }: RenderCellProps<any>) => {
          const val = row[col.key as keyof XSupabaseReferenceTableRow];
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
        maxWidth: 300,
      }) as Column<any>
  );

  const rows = _rows.map((row) => {
    return Object.keys(row).reduce((acc, k) => {
      const val = row[k as keyof XSupabaseReferenceTableRow];
      if (typeof val === "object") {
        return { ...acc, [k]: JSON.stringify(val) };
      }

      return { ...acc, [k]: val };
    }, {});
  });

  return (
    <DataGrid
      className="flex-grow select-none text-xs text-foreground/80"
      columns={columns}
      rows={rows}
      onCellDoubleClick={(args) => {
        const k = rowKey ? (args.row as any)[rowKey] : undefined;
        onSelected?.(k, args.row);
      }}
      renderers={{ noRowsFallback: <EmptyRowsRenderer loading={loading} /> }}
      rowKeyGetter={rowKey ? (row) => (row as any)[rowKey] : undefined}
      rowHeight={32}
      headerRowHeight={36}
    />
  );
}
