"use client";

import React from "react";
import DataGrid, { Column, RenderCellProps } from "react-data-grid";
import { CFCustomerRow } from "./types";
import { EmptyRowsRenderer } from "./empty";
import "./grid.css";

export function CustomerGrid({
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
  rows: CFCustomerRow[];
  rowKey?: string;
  onSelected?: (key: string, row: CFCustomerRow) => void;
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
