import type { SQLOrderBy } from "@/types";

export namespace PostgrestQuery {
  export type ParsedOrderBy = { [col: string]: SQLOrderBy };

  export function parseOrderByQueryString(orderQuery: string): ParsedOrderBy {
    const parsedOrderBy: ParsedOrderBy = {};

    const orderParams = orderQuery.split(",");
    orderParams.forEach((param) => {
      const parts = param.split(".");
      if (parts.length < 2) return; // Ensure at least column and direction are present
      const column = parts[0];
      if (!column) return; // Skip empty column names

      const orderBy: SQLOrderBy = { column };

      // Default order is ascending
      orderBy.ascending = parts.includes("asc");

      // Check for nullsfirst and nullslast
      orderBy.nullsFirst = parts.includes("nullsfirst")
        ? true
        : parts.includes("nullslast")
          ? false
          : undefined;

      // Add to result object
      parsedOrderBy[column] = orderBy;
    });

    return parsedOrderBy;
  }

  export function createOrderByQueryString(orderBy: ParsedOrderBy): string {
    return Object.keys(orderBy)
      .map((key) => {
        const order = orderBy[key];
        const direction = order.ascending ? "asc" : "desc";
        const nulls =
          order.nullsFirst !== undefined
            ? order.nullsFirst
              ? ".nullsfirst"
              : ".nullslast"
            : "";
        return `${order.column}.${direction}${nulls}`;
      })
      .join(",");
  }
}
