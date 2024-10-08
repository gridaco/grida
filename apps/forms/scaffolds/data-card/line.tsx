import React from "react";
import type { Data } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export function LineContent({
  value,
  property,
  wrap,
}: {
  value: any;
  property: Data.Relation.Attribute;
  wrap?: boolean;
}) {
  switch (property.format) {
    case "bool":
    case "boolean":
      return (
        <div className="flex gap-2 items-center">
          <Checkbox
            checked={value}
            disabled
            className="disabled:cursor-default"
          />
          <span className="text-xs text-muted-foreground">
            {value ? "true" : "false"}
          </span>
        </div>
      );
  }

  return (
    <>
      {property.array ? (
        <div
          data-wrap={wrap}
          className={"flex gap-0.5 data-[wrap='true']:flex-wrap"}
        >
          {(value as Array<any>).map((it, i) => {
            return (
              <Badge
                variant="outline"
                key={i}
                className="text-xs font-normal px-1.5"
              >
                {fmtsafely(String(it), property.scalar_format)}
              </Badge>
            );
          })}
        </div>
      ) : (
        <span className="text-xs w-full text-ellipsis overflow-hidden whitespace-nowrap">
          {fmtsafely(String(value), property.format)}
        </span>
      )}
    </>
  );
}

function fmtsafely(txt: string, format: Data.Relation.Attribute["format"]) {
  try {
    switch (format) {
      case "timetz":
      case "timestamptz":
      case "timestamp":
      case "timestamp without time zone":
      case "timestamp with time zone":
      case "date":
      case "time":
      case "time without time zone":
      case "time with time zone":
        return new Date(txt).toLocaleString();
      case "boolean":
        return txt === "true" ? "Yes" : "No";
      case "json":
      case "jsonb":
        return JSON.stringify(txt);
    }

    return txt;
  } catch (e) {
    return "ERR";
  }
}
