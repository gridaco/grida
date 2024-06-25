import type {
  PostgrestFilterBuilder,
  PostgrestQueryBuilder,
  PostgrestTransformBuilder,
} from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  limit(limit?: number) {
    if (limit === undefined) {
      return this;
    }
    this.query = (this.query as PostgrestFilterBuilder<any, any, any>).limit(
      limit
    );
    return this;
  }

  done() {
    return this.query;
  }
}
