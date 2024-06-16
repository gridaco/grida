"use client";

import React from "react";
import DataGrid, { Column, RenderCellProps } from "react-data-grid";
import { ReferenceTableRow } from "./types";
import "./grid.css";

export function ReferenceTableGrid({
  columns,
  rows,
}: {
  columns: {
    key: string;
    name: string;
    type?: string;
  }[];
  rows: ReferenceTableRow[];
}) {
  const cols = columns.map(
    (col) =>
      ({
        key: col.key,
        name: col.name,
        resizable: true,
        draggable: true,
        editable: false,
        width: undefined,
      }) as Column<any>
  );

  return (
    <DataGrid
      className="flex-grow border border-neutral-200 dark:border-neutral-900 select-none"
      columns={cols}
      rows={rows}
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
