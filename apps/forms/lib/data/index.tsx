import type { SQLOrderBy, SQLPredicate } from "@/types";

/**
 * Grida Data Module
 */
export namespace Data {
  /**
   * Relation (Query Function) Module
   *
   * A Relation is a abstract concept of a [table, view, materialized view, foreign table, partitioned table] in a database.
   * We often call this simply as view or table.
   */
  export namespace Relation {
    /**
     * usage:
     *
     * - this is used for revalidating the query, make sure no unnecessary revalidation is done (omit irrelevant property to the query it self)
     */
    export interface QueryState {
      /**
       * `LIMIT` rows per page
       *
       * a.k.a limit
       */
      q_page_limit: number;

      /**
       * current page index - shall be display with +1
       *
       * @default 0
       */
      q_page_index: number;

      /**
       * refresh key for request revalidation
       */
      q_refresh_key: number;

      /**
       * predicates, aka filter queries. eq, is, in...
       */
      q_predicates: Array<SQLPredicate>;

      /**
       * orderby queries in {ATTRIBUTE:SORT} format (as sorting can be applied only once per attribute)
       */
      q_orderby: { [key: string]: SQLOrderBy };
    }
  }
}