"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import { ITEM_SIZE, ListItem } from "./list-item";
import { useTableDefinition } from "../data-query";
import type { FormFieldDefinition } from "@/grida-forms-hosted/types";
import type { DGResponseRow } from "../grid";
import assert from "assert";
import { cn } from "@/components/lib/utils";
import { analyze } from "../data-card/analyze";

export function DataListView({
  rows,
  fields,
  className,
}: {
  rows: DGResponseRow[];
  fields: FormFieldDefinition[];
  className?: string;
}) {
  const definition = useTableDefinition();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateSize = () => {
      setSize({
        width: container.current?.clientWidth ?? 0,
        height: container.current?.clientHeight ?? 0,
      });
    };

    updateSize();

    window.addEventListener("resize", updateSize);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  assert(definition);

  const {
    normalpropertykeys,
    prioritiezed_virtual_media_columns,
    primary_virtual_media_column,
  } = useMemo(() => {
    return analyze({ definition, fields: fields });
  }, [definition, fields]);

  // Memoized Row function
  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = rows[index];
      return (
        <div style={style}>
          <ListItem
            data={row}
            media_fields={prioritiezed_virtual_media_columns}
            properties={normalpropertykeys.map((key) => ({
              ...definition.properties[key],
              name: key,
              label: key,
            }))}
          />
        </div>
      );
    },
    [rows]
  );

  return (
    <div ref={container} className={cn("w-full h-full", className)}>
      <List
        height={size.height}
        itemCount={rows.length}
        itemSize={ITEM_SIZE}
        width={"100%"}
      >
        {Row}
      </List>
    </div>
  );
}
