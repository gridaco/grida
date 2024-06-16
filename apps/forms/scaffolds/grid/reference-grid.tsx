"use client";

import React from "react";
import DataGrid, { Column, RenderCellProps } from "react-data-grid";
import { ReferenceTableRow } from "./types";
import "./grid.css";

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
  rows: ReferenceTableRow[];
  rowKey?: string;
  onSelected?: (key: string, row: ReferenceTableRow) => void;
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
      const val = row[k as keyof ReferenceTableRow];
      if (typeof val === "object") {
        return { ...acc, [k]: JSON.stringify(val) };
      }

      return { ...acc, [k]: val };
    }, {});
  });

  return (
    <DataGrid
      className="flex-grow border border-neutral-200 dark:border-neutral-900 select-none"
      columns={columns}
      rows={rows}
      onCellDoubleClick={(args) => {
        const k = rowKey ? args.row[rowKey] : undefined;
        onSelected?.(k, args.row);
      }}
      rowKeyGetter={rowKey ? (row) => row[rowKey] : undefined}
      rowHeight={44}
    />
  );
}

// function ColumnCell({ column, row }: RenderCellProps<ReferenceTableRow>) {
//   const data = row[column.key];

//   if (!data) {
//     return <></>;
//   }

//   const { type, format, value } = data;

//   return <div>{JSON.stringify(value)}</div>;
// }
