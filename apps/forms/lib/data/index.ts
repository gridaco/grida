import type { SupabasePostgRESTOpenApi } from "../supabase-postgrest";
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
      format:
        | PGSupportedColumnType
        | `${PGSupportedColumnType}[]`
        | (string & {});

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
      name: string;
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
      q_predicates: Array<Query.Predicate.ExtendedPredicate>;

      /**
       * orderby queries in {ATTRIBUTE:SORT} format (as sorting can be applied only once per attribute)
       */
      q_orderby: { [key: string]: Query.OrderBy.SQLOrderBy };

      /**
       * Only relevant for text and tsvector columns. Match only rows where
       * `column` matches the query string in `query`.
       */
      q_text_search: Query.Predicate.TextSearchQuery | null;
    }
  }

  export namespace Query {
    export namespace OrderBy {
      export interface SQLOrderBy {
        column: string;
        ascending?: boolean;
        nullsFirst?: boolean;
      }
    }
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

      export type TPredicate<OP extends string> = {
        column: string;
        op: OP;
        /**
         * value must be set for this predicate to be fulfilled
         * for `null | undefined`, the predicate will be ignored
         */
        value: unknown | null | undefined;
      };

      export type ExtendedPredicate = TPredicate<
        PredicateOperatorKeyword | Extension.PrediacteExtensionType
      >;

      export type SQLPredicate = TPredicate<PredicateOperatorKeyword>;

      export type PredicateOperatorKeyword =
        | "eq" // Equals
        | "neq" // Not Equals
        | "gt" // Greater Than
        | "gte" // Greater Than or Equal
        | "lt" // Less Than
        | "lte" // Less Than or Equal
        | "like" // Case-Sensitive Pattern Match
        | "ilike" // Case-Insensitive Pattern Match
        | "is" // Is (NULL check, etc.)
        | "in" // In (list of values)
        | "cs" // Contains (JSON/Array containment)
        | "cd" // Contained By (JSON/Array containment)
        | "sl" // Strictly Left of (range operation)
        | "sr" // Strictly Right of (range operation)
        | "nxl" // Not Extends to the Left of (range operation)
        | "nxr" // Not Extends to the Right of (range operation)
        | "adj" // Adjacent to (range operation)
        | "ov" // Overlaps (range operation)
        | "fts" // Full-Text Search
        | "plfts" // Phrase Full-Text Search
        | "phfts" // Plain Full-Text Search
        | "wfts"; // Web Full-Text Search

      export namespace K {
        export function get_operators_by_format(
          format: SupabasePostgRESTOpenApi.PostgRESTOpenAPIDefinitionPropertyFormatType
        ): PredicateOperatorKeyword[] {
          const _get_for_non_array = (
            format: PGSupportedColumnType
          ): PredicateOperatorKeyword[] => {
            switch (format) {
              case "int":
              case "int2":
              case "int4":
              case "int8":
              case "smallint":
              case "integer":
              case "bigint":
              case "decimal":
              case "numeric":
              case "real":
              case "float":
              case "float4":
              case "float8":
              case "double precision":
              case "money":
                return ["eq", "neq", "gt", "gte", "lt", "lte", "is", "in"];

              case "character varying":
              case "varchar":
              case "character":
              case "char":
              case "text":
              case "citext":
                return [
                  "eq",
                  "neq",
                  "like",
                  "ilike",
                  "is",
                  "in",
                  "fts",
                  "plfts",
                  "phfts",
                  "wfts",
                ];

              case "bool":
              case "boolean":
                return ["eq", "neq", "is"];

              case "json":
              case "jsonb":
              case "hstore":
                return ["eq", "neq", "is", "cs", "cd", "ov"];

              case "tsvector":
              case "tsquery":
                return ["eq", "neq", "fts", "plfts", "phfts", "wfts"];

              case "uuid":
              case "inet":
              case "cidr":
              case "macaddr":
                return ["eq", "neq", "is", "in"];

              case "xml":
                return ["eq", "neq", "is", "in"];

              case "date":
              case "timestamp":
              case "timestamptz":
              case "timestamp without time zone":
              case "timestamp with time zone":
              case "time":
              case "time without time zone":
              case "time with time zone":
              case "timetz":
              case "interval":
                return ["eq", "neq", "gt", "gte", "lt", "lte", "is", "in"];

              case "point":
              case "line":
              case "lseg":
              case "box":
              case "path":
              case "polygon":
              case "circle":
                return [
                  "eq",
                  "neq",
                  "is",
                  "sl",
                  "sr",
                  "nxl",
                  "nxr",
                  "adj",
                  "ov",
                ];

              case "int4range":
              case "int8range":
              case "numrange":
              case "tsrange":
              case "tstzrange":
              case "daterange":
              case "int4multirange":
              case "int8multirange":
              case "nummultirange":
              case "tsmultirange":
              case "tstzmultirange":
              case "datemultirange":
                return [
                  "eq",
                  "neq",
                  "is",
                  "sl",
                  "sr",
                  "nxl",
                  "nxr",
                  "adj",
                  "ov",
                  "cs",
                  "cd",
                ];

              default:
                return ["eq", "neq", "is"];
            }
          };

          if (format.includes("[]")) {
            const baseFormat = format.replace(
              "[]",
              ""
            ) as PGSupportedColumnType;
            // For array types, the operators "cs" (contains) and "cd" (contained by) are typically used
            return [..._get_for_non_array(baseFormat), "cs", "cd"];
          } else {
            return _get_for_non_array(format as PGSupportedColumnType);
          }
        }

        export const ui_supported_operators: PredicateOperatorKeyword[] = [
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "like",
          "ilike",
          "is",
          "in",
        ];

        export const supported_extensions: Extension.PrediacteExtensionType[] =
          [
            "EXT_CONTAINS",
            "EXT_STARTS_WITH",
            "EXT_ENDS_WITH",
            "EXT_IS_EMPTY",
            "EXT_IS_NOT_EMPTY",
          ];

        type OperatorConfig = {
          symbol: string;
          label: string;
          /**
           * whether this operator requires a value
           * for some extension operators, it does not have a value (e.g. EXT_IS_EMPTY)
           */
          required: boolean;
          /**
           * extends another operator (if extension)
           */
          extends: PredicateOperatorKeyword | null;

          /**
           * the explicit format this operator is applicable to
           * if null, it is not specified and should follow the default behavior
           * for extension, follow extends' default behavior
           */
          format:
            | (PGSupportedColumnType | `${PGSupportedColumnType}[]`)[]
            | null;
        };

        export const operators: Record<
          PredicateOperatorKeyword | Extension.PrediacteExtensionType,
          OperatorConfig
        > = {
          eq: {
            symbol: "=",
            label: "[=] equals",
            required: true,
            extends: null,
            format: null,
          },
          neq: {
            symbol: "<>",
            label: "[<>] not equal",
            required: true,
            extends: null,
            format: null,
          },
          gt: {
            symbol: ">",
            label: "[>] greater than",
            required: true,
            extends: null,
            format: null,
          },
          gte: {
            symbol: ">=",
            label: "[>=] greater than or equal",
            required: true,
            extends: null,
            format: null,
          },
          lt: {
            symbol: "<",
            label: "[<] less than",
            required: true,
            extends: null,
            format: null,
          },
          lte: {
            symbol: "<=",
            label: "[<=] less than or equal",
            required: true,
            extends: null,
            format: null,
          },
          like: {
            symbol: "~~",
            label: "[~~] like operator",
            required: true,
            extends: null,
            format: null,
          },
          ilike: {
            symbol: "~~*",
            label: "[~~*] ilike operator",
            required: true,
            extends: null,
            format: null,
          },
          is: {
            symbol: "is",
            label: "[is] is (null, not null, true, false)",
            required: true,
            extends: null,
            format: null,
          },
          in: {
            symbol: "in",
            label: "[in] one of the values",
            required: true,
            extends: null,
            format: null,
          },
          //
          cs: {
            symbol: "@>",
            label: "[@>] contains",
            required: true,
            extends: null,
            format: null,
          }, // Contains operator (in array)
          cd: {
            symbol: "<@",
            label: "[<@] contained by",
            required: true,
            extends: null,
            format: null,
          }, // Contained by operator (in array)
          sl: {
            symbol: "<<",
            label: "[<<] strictly left of",
            required: true,
            extends: null,
            format: null,
          }, // Range strictly left
          sr: {
            symbol: ">>",
            label: "[>>] strictly right of",
            required: true,
            extends: null,
            format: null,
          }, // Range strictly right
          nxl: {
            symbol: "&<",
            label: "[&<] does not extend to the left of",
            required: true,
            extends: null,
            format: null,
          }, // No extend left
          nxr: {
            symbol: "&>",
            label: "[&>] does not extend to the right of",
            required: true,
            extends: null,
            format: null,
          }, // No extend right
          adj: {
            symbol: "-|-",
            label: "[-|-] adjacent",
            required: true,
            extends: null,
            format: null,
          }, // Adjacent operator
          ov: {
            symbol: "&&",
            label: "[&&] overlaps",
            required: true,
            extends: null,
            format: null,
          }, // Overlaps operator
          fts: {
            symbol: "@@",
            label: "[@@] full-text search",
            required: true,
            extends: null,
            format: null,
          }, // Full-text search
          plfts: {
            symbol: "@@@",
            label: "[@@@] plain full-text search",
            required: true,
            extends: null,
            format: null,
          }, // Plain full-text search
          phfts: {
            symbol: "@@@@",
            label: "[@@@@] phrase full-text search",
            required: true,
            extends: null,
            format: null,
          }, // Phrase full-text search
          wfts: {
            symbol: "@@@@",
            label: "[@@@@] web search",
            required: true,
            extends: null,
            format: null,
          }, // Web search

          //
          EXT_CONTAINS: {
            symbol: "contains",
            label: "Contains",
            required: true,
            extends: "ilike",
            format: null,
          },
          EXT_STARTS_WITH: {
            symbol: "starts with",
            label: "Starts with",
            required: true,
            extends: "ilike",
            format: null,
          },
          EXT_ENDS_WITH: {
            symbol: "ends with",
            label: "Ends with",
            required: true,
            extends: "ilike",
            format: null,
          },
          EXT_IS_EMPTY: {
            symbol: "is empty",
            label: "Is empty",
            required: false,
            extends: "eq",
            format: [
              "character varying",
              "varchar",
              "character",
              "char",
              "text",
              "citext",
            ],
          },
          EXT_IS_NOT_EMPTY: {
            symbol: "is not empty",
            label: "Is not empty",
            required: false,
            extends: "neq",
            format: [
              "character varying",
              "varchar",
              "character",
              "char",
              "text",
              "citext",
            ],
          },
        } as const;
      }

      /**
       * Handy Predicate Extension
       */
      export namespace Extension {
        /**
         * Predicate extensions (templates) type
         *
         * - `EXT_CONTAINS` - `ilike %txt%`
         * - `EXT_STARTS_WITH` - `ilike txt%`
         * - `EXT_ENDS_WITH` - `ilike %txt`
         * - `EXT_IS_EMPTY` - `eq ""`
         * - `EXT_IS_NOT_EMPTY` - `neq ""`
         *
         * Caution: this should be constant. changing the key might impact persistence (e.g. predicates value saved to service db or local storage)
         */
        export type PrediacteExtensionType =
          | "EXT_CONTAINS"
          | "EXT_STARTS_WITH"
          | "EXT_ENDS_WITH"
          | "EXT_IS_EMPTY"
          | "EXT_IS_NOT_EMPTY";

        export function encode(p: ExtendedPredicate): SQLPredicate {
          const { op, value, column } = p;
          switch (op) {
            case "EXT_CONTAINS": {
              // txt => %txt%
              // omit if null, undefined or empty string (we can ignore the 0 case as its ilike, only string value is expected)
              const encoded = value ? `%${value}%` : undefined;
              return {
                op: "ilike",
                value: encoded,
                column,
              };
            }
            case "EXT_ENDS_WITH": {
              // txt => %txt
              // omit if null, undefined or empty string (we can ignore the 0 case as its ilike, only string value is expected)
              const encoded = value ? `%${value}` : undefined;
              return {
                op: "ilike",
                value: encoded,
                column,
              };
            }
            case "EXT_STARTS_WITH": {
              // txt => ilike txt%
              // omit if null, undefined or empty string (we can ignore the 0 case as its ilike, only string value is expected)
              const encoded = value ? `${value}%` : undefined;
              return {
                op: "ilike",
                value: encoded,
                column,
              };
            }
            case "EXT_IS_EMPTY": {
              return {
                op: "eq",
                value: "",
                column,
              };
            }
            case "EXT_IS_NOT_EMPTY": {
              return {
                op: "neq",
                value: "",
                column,
              };
            }
            default:
              return {
                op,
                value,
                column,
              } satisfies SQLPredicate;
          }
        }
      }
    }
  }
}
