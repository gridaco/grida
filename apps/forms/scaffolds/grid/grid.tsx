"use client";
import "react-data-grid/lib/styles.css";
import DataGrid from "react-data-grid";

export function Grid({ columns, rows }: { columns: any[]; rows: any[] }) {
  return (
    <DataGrid
      className="border border-gray-200 h-max"
      columns={columns}
      rows={rows}
    />
  );
}
