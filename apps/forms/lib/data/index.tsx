import type { SQLOrderBy, SQLPredicate } from "@/types";
import type { SupabasePostgRESTOpenApi } from "../supabase-postgrest";
import type { XPostgrestQuery } from "@/lib/supabase-postgrest/builder";

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
     * A single table definition in postgREST open api format
     */
    export type PostgRESTRelationJSONSchema =
      SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema;

    export type Schema = PostgRESTRelationJSONSchema;

    // export interface QueryViewState {
    //   schema: Schema;
    //   query: QueryState;
    // }

    export const INITIAL_QUERY_STATE: QueryState = {
      q_page_limit: 100,
      q_page_index: 0,
      q_refresh_key: 0,
      q_orderby: {},
      q_predicates: [],
    };

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

  export namespace Query {
    export namespace Predicate {
      export namespace K {
        export const supported_operators: XPostgrestQuery.PredicateOperator.SQLPredicateOperatorKeyword[] =
          ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"];

        export const operator_labels: Record<
          XPostgrestQuery.PredicateOperator.SQLPredicateOperatorKeyword,
          { symbol: string; label: string }
        > = {
          eq: { symbol: "=", label: "[=] equals" },
          neq: { symbol: "<>", label: "[<>] not equal" },
          gt: { symbol: ">", label: "[>] greater than" },
          gte: { symbol: ">=", label: "[>=] greater than or equal" },
          lt: { symbol: "<", label: "[<] less than" },
          lte: { symbol: "<=", label: "[<=] less than or equal" },
          like: { symbol: "~~", label: "[~~] like operator" },
          ilike: { symbol: "~~*", label: "[~~*] ilike operator" },
          is: { symbol: "is", label: "[is] is (null, not null, true, false)" },
          in: { symbol: "in", label: "[in] one of the values" },
          //
          cs: { symbol: "@>", label: "[@>] contains" }, // Contains operator
          cd: { symbol: "<@", label: "[<@] contained by" }, // Contained by operator
          sl: { symbol: "<<", label: "[<<] strictly left of" }, // Range strictly left
          sr: { symbol: ">>", label: "[>>] strictly right of" }, // Range strictly right
          nxl: { symbol: "&<", label: "[&<] does not extend to the left of" }, // No extend left
          nxr: { symbol: "&>", label: "[&>] does not extend to the right of" }, // No extend right
          adj: { symbol: "-|-", label: "[-|-] adjacent" }, // Adjacent operator
          ov: { symbol: "&&", label: "[&&] overlaps" }, // Overlaps operator
          fts: { symbol: "@@", label: "[@@] full-text search" }, // Full-text search
          plfts: { symbol: "@@@", label: "[@@@] plain full-text search" }, // Plain full-text search
          phfts: { symbol: "@@@@", label: "[@@@@] phrase full-text search" }, // Phrase full-text search
          wfts: { symbol: "@@@@", label: "[@@@@] web search" }, // Web search
        };
      }

      export namespace Extension {
        // TODO: negate are not supported yet

        export type HandyPrediacteExtension =
          | "EX_CONTAINS"
          // | "EX_NOT_CONTAINS"
          | "EX_STARTS_WITH"
          | "EX_ENDS_WITH"
          | "EX_IS_EMPTY";
        // | "EX_IS_NOT_EMPTY";

        export type TransformedFormalPredicate = {
          op: XPostgrestQuery.PredicateOperator.SQLPredicateOperatorKeyword;
          input: unknown;
          value: unknown;
        };

        export function transformHandyPredicateExtension(
          type: HandyPrediacteExtension,
          input: unknown
        ): TransformedFormalPredicate {
          switch (type) {
            case "EX_CONTAINS": {
              return {
                op: "ilike",
                input,
                value: `%${input}%`,
              };
            }
            // case "EX_NOT_CONTAINS": {
            //   return {
            //     op: "ilike",
            //     value: `%${value}%`,
            //     negation: true,
            //   };
            // }
            case "EX_STARTS_WITH": {
              return {
                op: "ilike",
                input,
                value: `${input}%`,
              };
            }
            case "EX_ENDS_WITH": {
              return {
                op: "ilike",
                input,
                value: `%${input}`,
              };
            }
            case "EX_IS_EMPTY": {
              return {
                op: "is",
                input,
                value: "",
              };
            }
            // case "EX_IS_NOT_EMPTY": {
            //   return {
            //     op: "is",
            //     value: "",
            //     negation: true,
            //   };
            // }
          }
        }
      }
    }
  }
}
