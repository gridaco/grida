import type { SQLOrderBy, SQLPredicate } from "@/types";
import {
  PostgrestQueryBuilder,
  type PostgrestFilterBuilder,
  type PostgrestSingleResponse,
  type PostgrestTransformBuilder,
} from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export namespace XPostgrestQuery {
  export interface Body {
    values?: any;
    filters?: ReadonlyArray<NamedPredicate>;
  }
  export type NamedPredicate = EQPredicate | INPredicate;
  interface EQPredicate {
    type: "eq";
    column: string;
    value: unknown;
  }

  interface INPredicate {
    type: "in";
    column: string;
    values: ReadonlyArray<unknown>;
  }

  export type OrderBy = { [col: string]: SQLOrderBy };

  /**
   * modular, partial postgrest query string builder / parser
   */
  export namespace QS {
    /**
     * returns URLSearchParams for proxy select (GET) query
     * @returns
     */
    export function select({
      columns = "*",
      limit,
      order,
      filters,
    }: {
      columns?: string;
      limit?: number;
      order?: { [col: string]: SQLOrderBy };
      filters?: ReadonlyArray<SQLPredicate>;
    }) {
      const pq = new PostgrestQueryBuilder(new URL("noop:noop"), {});

      let f = pq
        .select(columns)
        // this prevents the query from being executed (although it will never be sent + the url is noop, extra safety)
        .rollback();

      // limit
      if (limit) f = f.limit(limit);

      // order
      if (order) {
        for (const o in order) {
          const v = order[o];
          f = f.order(v.column, {
            ascending: v.ascending,
            nullsFirst: v.nullsFirst,
          });
        }
      }

      // filters
      if (filters) {
        for (const filter of filters) {
          f = f.filter(filter.column, filter.op, filter.value);
        }
      }

      const params = new URLSearchParams(f["url"]["searchParams"]);

      if (!columns) {
        params.delete("select");
      }

      return params;
    }

    export function parseOrderby(orderQuery: string): OrderBy {
      const parsedOrderBy: OrderBy = {};

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

    /**
     * @deprecated use PostgrestQueryBuilder from @supabase/postgrest-js instead
     */
    export function orderby(orderBy: OrderBy): string {
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
}

export class XSupabaseClientQueryBuilder {
  private builder:
    | PostgrestQueryBuilder<any, any>
    | PostgrestTransformBuilder<any, any, any>
    | PostgrestFilterBuilder<any, any, any>
    | null = null;

  constructor(readonly client: SupabaseClient) {}

  from(table: string) {
    this.builder = this.client.from(table);
    return this;
  }

  select(columns: string) {
    this.builder = this.builder!.select(columns);
    return this;
  }

  delete(
    ...parameters: Parameters<PostgrestQueryBuilder<any, any, any>["delete"]>
  ) {
    this.builder = (this.builder as PostgrestQueryBuilder<any, any>).delete(
      ...parameters
    );
    return this;
  }

  update(
    ...parameters: Parameters<PostgrestQueryBuilder<any, any, any>["update"]>
  ) {
    this.builder = (this.builder as PostgrestQueryBuilder<any, any>).update(
      ...parameters
    );
    return this;
  }

  eq(...parameters: Parameters<PostgrestFilterBuilder<any, any, any>["eq"]>) {
    this.builder = (this.builder as PostgrestFilterBuilder<any, any, any>).eq(
      ...parameters
    );
    return this;
  }

  in(...parameters: Parameters<PostgrestFilterBuilder<any, any, any>["in"]>) {
    this.builder = (this.builder as PostgrestFilterBuilder<any, any, any>).in(
      ...parameters
    );
    return this;
  }

  limit(limit?: number) {
    if (limit === undefined) {
      return this;
    }
    this.builder = (
      this.builder as PostgrestFilterBuilder<any, any, any>
    ).limit(limit);
    return this;
  }

  order(
    ...parameters: Parameters<PostgrestFilterBuilder<any, any, any>["order"]>
  ) {
    this.builder = (
      this.builder as PostgrestFilterBuilder<any, any, any>
    ).order(...parameters);
    return this;
  }

  private params<
    T extends XPostgrestQuery.NamedPredicate = XPostgrestQuery.NamedPredicate,
  >(filter: T): Parameters<PostgrestFilterBuilder<any, any, any>[T["type"]]> {
    switch (filter.type) {
      case "eq":
        return [filter.column, filter.value] as unknown as Parameters<
          PostgrestFilterBuilder<any, any, any>[T["type"]]
        >;
      case "in":
        return [filter.column, filter.values] as unknown as Parameters<
          PostgrestFilterBuilder<any, any, any>[T["type"]]
        >;
    }
  }

  fromFilter(filter: XPostgrestQuery.NamedPredicate) {
    switch (filter.type) {
      case "eq":
        this.eq(...this.params(filter));
        break;
      case "in":
        this.in(...this.params(filter));
        break;
    }

    return this;
  }

  fromFilters(filters?: ReadonlyArray<XPostgrestQuery.NamedPredicate>) {
    if (!filters) return this;

    for (const filter of filters) {
      this.fromFilter(filter);
    }

    return this;
  }

  /**
   * extends current query (url.searchParams) the already-built query (new searchParams)
   *
   * this is used from server-side proxy to perform the query with the query built from the client
   *
   * @param searchParams
   * @param override
   */
  fromSearchParams(searchParams: URLSearchParams, override: boolean = false) {
    const prev = (this.builder as PostgrestFilterBuilder<any, any, any>)["url"][
      "searchParams"
    ];

    if (override) {
      prev.forEach((_, key) => {
        prev.delete(key);
      });
    }

    searchParams.forEach((value, key) => {
      prev.set(key, value);
    });
  }

  done() {
    return this.builder as any as PostgrestSingleResponse<any | any[]>;
  }
}
