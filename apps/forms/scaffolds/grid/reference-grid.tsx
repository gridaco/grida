"use client";

import React from "react";
import DataGrid, { Column, RenderCellProps } from "react-data-grid";
import { XSupabaseReferenceTableRow } from "./types";
import "./grid.css";
import { Skeleton } from "@/components/ui/skeleton";

export function ReferenceTableGrid({
  columns: _columns,
  rows: _rows,
  rowKey,
  onSelected,
}: {
  columns: {
    key: string;
    name: string;
    type?: string;
  }[];
  rows: XSupabaseReferenceTableRow[];
  rowKey?: string;
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
      className="flex-grow select-none"
      columns={columns}
      rows={rows}
      onCellDoubleClick={(args) => {
        const k = rowKey ? (args.row as any)[rowKey] : undefined;
        onSelected?.(k, args.row);
      }}
      renderers={{ noRowsFallback: <EmptyRowsRenderer /> }}
      rowKeyGetter={rowKey ? (row) => (row as any)[rowKey] : undefined}
      rowHeight={44}
    />
  );
}

function EmptyRowsRenderer() {
  return (
    <div className="p-4 flex flex-col space-y-3">
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  );
}
