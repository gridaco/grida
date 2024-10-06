import { cn } from "@/utils";
import { useTableDefinition } from "../data-query";
import assert from "assert";
import type { DGColumn, DGResponseRow } from "../grid";
import { useMemo } from "react";
import { analyze } from "../data-card/analyze";
import { DataCard } from "../data-card/card";

export function Gallery({
  className,
  rows,
  columns,
}: {
  rows: DGResponseRow[];
  columns: DGColumn[];
  className?: string;
}) {
  const definition = useTableDefinition();

  assert(definition);

  const {
    normalpropertykeys,
    prioritiezed_virtual_media_columns,
    primary_virtual_media_column,
  } = useMemo(() => {
    return analyze({ definition, columns });
  }, [definition, columns]);

  return (
    <div
      className={cn(
        "p-4 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
    >
      {rows.map((row, i) => {
        return (
          <DataCard
            key={i}
            data={row}
            primary_media_column_key={primary_virtual_media_column?.key || null}
            media_columns={prioritiezed_virtual_media_columns}
            properties={normalpropertykeys.map((key) => ({
              ...definition.properties[key],
              name: key,
              label: key,
            }))}
          />
        );
      })}
    </div>
  );
}
