import type { SQLOrderBy, SQLPredicate } from "@/types";
import type { SupabasePostgRESTOpenApi } from "../supabase-postgrest";
import type { XPostgrestQuery } from "@/lib/supabase-postgrest/builder";
import type { JSONType } from "ajv";
import type { PGSupportedColumnType } from "../pg-meta/@types/pg";

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

    export type DefinitionJSONSchema = PostgRESTRelationJSONSchema;

    /**
     * FK relationship with a single referencing column
     *
     * non-composite foreign key relationship
     *
     * @example
     * ```sql
     * constraint some_id_fkey foreign key (some_id) references some_table(some_id)
     * ```
     * use when only one column per foreign key is supported (e.g. postgREST)
     */
    export type NonCompositeRelationship = {
      referencing_column: string;
      referenced_table: string;
      referenced_column: string;
    };

    /**
     * Analyzed Table Property (Column) Definition
     *
     * This type is a standard representation of a column definition in a table.
     */
    export type Attribute = {
      /**
       * column name
       */
      name: string;

      description: string | undefined;

      /**
       * type - json schema type
       *
       * when format is json or jsonb, the type is undefined (not "object") since json can be any type @see https://github.com/PostgREST/postgrest/issues/3744
       */
      type:
        | "string"
        | "number"
        | "integer"
        | "boolean"
        | "null"
        | "array"
        | undefined;

      /**
       * format - sql column type
       *
       * Important: this can also be any string for user defined types (although we are not explicitly typing as so)
       */
      format: PGSupportedColumnType | `${PGSupportedColumnType}[]` | string;

      /**
       * format - sql column type (scalar - non array)
       *
       * Important: this can also be any string for user defined types (although we are not explicitly typing as so)
       */
      scalar_format: PGSupportedColumnType;

      /**
       * when present, this is an enum type
       */
      enum: string[] | undefined;

      /**
       * if this is an array type.
       *
       * when true, the {@link Attribute.type} shall be `"array"` the {@link Attribute.format} is an array type, including `...[]`
       */
      array: boolean;

      /**
       * this is primary key
       */
      pk: boolean;

      /**
       * this is foreign key
       */
      fk: NonCompositeRelationship | false;

      /**
       * nullable
       *
       * `null` or `not null`
       *
       */
      null: boolean;

      /**
       * default value
       */
      default: string | undefined;
    };

    export type TableDefinition = {
      pks: string[];
      fks: NonCompositeRelationship[];
      properties: Record<string, Attribute>;
    };

    export const INITIAL_QUERY_STATE: QueryState = {
      q_page_limit: 100,
      q_page_index: 0,
      q_refresh_key: 0,
      q_orderby: {},
      q_predicates: [],
      q_text_search: null,
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

      /**
       * Only relevant for text and tsvector columns. Match only rows where
       * `column` matches the query string in `query`.
       */
      q_text_search: Query.Predicate.TextSearchQuery | null;
    }
  }

  export namespace Query {
    export namespace Predicate {
      export type TextSearchQuery = {
        /**
         * The text or tsvector column to filter on
         */
        column: string | null;

        /**
         * The query text to match with
         */
        query: string;

        /**
         * Change how the `query` text is interpreted
         */
        type: "plain" | "phrase" | "websearch";
      };

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
