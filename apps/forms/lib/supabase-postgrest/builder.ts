import type {
  PostgrestFilterBuilder,
  PostgrestQueryBuilder,
  PostgrestTransformBuilder,
} from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export namespace XSupabaseQuery {
  export type Filter = EQ | IN;

  type Scalar = string | number | boolean | null;

  interface EQ {
    type: "eq";
    column: string;
    value: Scalar;
  }

  interface IN {
    type: "in";
    column: string;
    values: ReadonlyArray<Scalar>;
  }

  type INParams = Parameters<PostgrestFilterBuilder<any, any, any>["in"]>;

  export function asParams<T extends Filter = Filter>(
    filter: T
  ): Parameters<PostgrestFilterBuilder<any, any, any>[T["type"]]> {
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
}

export class XSupabaseQueryBuilder {
  private query:
    | PostgrestQueryBuilder<any, any>
    | PostgrestTransformBuilder<any, any, any>
    | PostgrestFilterBuilder<any, any, any>
    | null = null;

  constructor(readonly client: SupabaseClient) {}

  from(table: string) {
    this.query = this.client.from(table);
    return this;
  }

  select(columns: string) {
    this.query = this.query!.select(columns);
    return this;
  }

  delete() {
    this.query = (this.query as PostgrestQueryBuilder<any, any>).delete();
    return this;
  }

  in(...parameters: Parameters<PostgrestFilterBuilder<any, any, any>["in"]>) {
    this.query = (this.query as PostgrestFilterBuilder<any, any, any>).in(
      ...parameters
    );
    return this;
  }

  limit(limit?: number) {
    if (limit === undefined) {
      return this;
    }
    this.query = (this.query as PostgrestFilterBuilder<any, any, any>).limit(
      limit
    );
    return this;
  }

  fromFilter(filter: XSupabaseQuery.Filter) {
    switch (filter.type) {
      case "eq":
        throw new Error("Not implemented");
        break;
      case "in":
        this.in(...XSupabaseQuery.asParams(filter));
        break;
    }

    return this;
  }

  fromFilters(filters: ReadonlyArray<XSupabaseQuery.Filter>) {
    for (const filter of filters) {
      this.fromFilter(filter);
    }

    return this;
  }

  done() {
    return this.query;
  }
}
