"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import DataGrid, { type Column } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import "./simple-csv-table.css";

interface CSVPreviewProps {
  count: number;
  data: any[];
  /** Height of the grid viewport. When omitted, the grid fills its container (use a parent with defined height). */
  height?: number;
  className?: string;
}

type CSVRow = Record<string, string | number | null | undefined>;

/**
 * CSV preview using react-data-grid: virtualized, horizontally scrollable,
 * and suitable for large datasets.
 */
export function SimpleCSVTable({
  data,
  count,
  height: heightProp,
  className,
}: CSVPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(heightProp ?? 400);

  useEffect(() => {
    if (heightProp != null) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { height } = entries[0]?.contentRect ?? {};
      if (typeof height === "number" && height > 0) setContainerHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [heightProp]);

  const height = heightProp ?? containerHeight;

  const { columns, rows } = useMemo(() => {
    if (!data?.length) return { columns: [] as Column<CSVRow>[], rows: [] };

    const allKeys = Array.from(
      new Set(data.flatMap((item) => Object.keys(item)))
    );

    const systemColumn: Column<CSVRow> = {
      key: "__rowNum",
      name: "#",
      resizable: false,
      width: 56,
      minWidth: 56,
    };

    const dataColumns: Column<CSVRow>[] = allKeys.map((key) => ({
      key,
      name: key,
      resizable: true,
      minWidth: 100,
    }));

    const columns: Column<CSVRow>[] = [systemColumn, ...dataColumns];

    const rows: CSVRow[] = data.map((row, index) => {
      const out: CSVRow = { __rowIndex: index, __rowNum: index + 1 };
      for (const k of allKeys) {
        const v = row[k];
        out[k] =
          v === null || v === undefined
            ? ""
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
      }
      return out;
    });

    return { columns, rows };
  }, [data]);

  if (!data?.length) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No data to preview
      </div>
    );
  }

  const fillContainer = heightProp == null;

  return (
    <div
      className={className}
      style={
        fillContainer
          ? {
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }
          : undefined
      }
    >
      <div
        ref={containerRef}
        className={fillContainer ? "min-h-0 flex-1" : undefined}
        style={fillContainer ? { minHeight: 0 } : undefined}
      >
        <DataGrid<CSVRow>
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => String(row.__rowIndex ?? rows.indexOf(row))}
          style={{ height, minWidth: "100%" }}
          className="rdg-csv-preview border rounded-md"
          rowHeight={32}
          headerRowHeight={36}
        />
      </div>
      {count > data.length && (
        <p className="shrink-0 text-center text-sm text-muted-foreground py-2 border-t">
          {count - data.length} more records not shown in preview
        </p>
      )}
    </div>
  );
}
