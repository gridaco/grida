import type { FormInputType } from "@/types";
import type { PGSupportedColumnType } from "../pg-meta/@types/pg";
import type { SupabasePostgRESTOpenApi } from "../supabase-postgrest";
import type { XPostgrestQuery } from "../supabase-postgrest/builder";
import type { Data } from "../data";

export namespace PostgresTypeTools {
  /**
   * - `default` - Default suggestion. most likely to be used.
   * - `suggested` - The field is suggested and likely to be used.
   * - `allowed` - The field is allowed, yet not likely to be suggested.
   */
  type SuggestionType = keyof SuggestionMap;

  type SuggestionMap = {
    default: FormInputType;
    suggested: FormInputType[];
    // allowed: FormInputType[];
  };

  const postgrest_property_type_map: Record<string, SuggestionMap> = {
    string: {
      default: "text",
      suggested: ["text", "textarea", "email"],
    },
    number: {
      default: "number",
      suggested: ["number"],
    },
    integer: {
      default: "number",
      suggested: ["number"],
    },
    boolean: {
      default: "checkbox",
      suggested: ["checkbox", "switch"],
    },
    array: {
      default: "toggle-group",
      suggested: ["toggle-group"],
    },
  };

  export function getSuggestion({
    type,
    format,
    enum: _enum,
    is_array,
  }: {
    type?: string;
    format: string;
    enum?: string[];
    is_array?: boolean;
  }): SuggestionMap | undefined {
    switch (format) {
      case "jsonb":
      case "json":
        return {
          default: "json",
          suggested: ["json"],
        };
      case "character varying":
        return postgrest_property_type_map.string;
      case "timestamp with time zone":
        return {
          default: "datetime-local",
          suggested: ["datetime-local"],
        };
      case "inet":
        return {
          default: "text",
          suggested: ["text"],
        };
      case "uuid":
        return {
          default: "search",
          suggested: ["search", "text"],
        };
    }
    if (is_array) {
      return {
        default: "toggle-group",
        suggested: ["toggle-group"],
      };
    }

    if (_enum) {
      return {
        default: "select",
        suggested: ["select", "toggle-group"],
      };
    }

    if (type) {
      return postgrest_property_type_map[type];
    }

    return undefined;
  }

  export type SQLLiteralInputConfig =
    | { type: "text" }
    | { type: "boolean" }
    | { type: "json" }
    | { type: "xml" }
    | { type: "select"; options: string[] }
    | { type: "number"; min?: number; max?: number; step?: number }
    | { type: "is"; accepts_boolean: boolean }
    | { type: "time"; with_time_zone: boolean }
    | { type: "datetime-local"; with_time_zone: boolean }
    | { type: "date"; with_time_zone: boolean }
    | {
        type: "search";
        relation: Data.Relation.NonCompositeRelationship;
      };

  export type SQLLiteralInputType = SQLLiteralInputConfig["type"];

  export function getSQLLiteralInputConfig(
    meta: SupabasePostgRESTOpenApi.PostgRESTColumnMeta
  ): Exclude<SQLLiteralInputConfig, { type: "is" }> | undefined {
    if (meta.format?.includes("[]")) {
      return { type: "text" };
    }

    // for fk relation
    if (meta.fk) {
      return {
        type: "search",
        relation: meta.fk,
      };
    }

    // for enum type
    if (meta.enum) {
      return {
        type: "select",
        options: meta.enum,
      };
    }

    // others
    const input_type =
      postgrest_column_type_to_literal_input_type[
        meta.format as PGSupportedColumnType
      ];

    switch (input_type) {
      case "search":
      case "select":
        break;
      case "json":
      case "text":
      case "xml":
      case "boolean":
        return {
          type: input_type,
        };
      case "number":
        return {
          type: "number",
          // TODO:
          // min:
          // max:
          // step:
        };
      case "date":
      case "datetime-local":
      case "time":
        return {
          type: input_type,
          with_time_zone:
            (meta.format?.endsWith("with time zone") ||
              meta.format?.endsWith("tz")) ??
            false,
        };
    }
  }

  const postgrest_column_type_to_literal_input_type: Record<
    PGSupportedColumnType,
    Exclude<SQLLiteralInputType, "is"> | undefined
  > = {
    // Number Types
    bigint: "number",
    integer: "number",
    int: "number",
    int2: "number",
    int4: "number",
    int8: "number",
    smallint: "number",
    decimal: "number",
    numeric: "number",
    real: "number",
    float: "number",
    float4: "number",
    float8: "number",
    "double precision": "number",
    money: "number",

    // Boolean Types
    bool: "boolean",
    boolean: "boolean",

    // Date/Time Types
    date: "date",
    timestamp: "datetime-local",
    "timestamp without time zone": "datetime-local",
    "timestamp with time zone": "datetime-local",
    timestamptz: "datetime-local",
    time: "time",
    "time without time zone": "time",
    "time with time zone": "time",
    timetz: "time",

    // Text Types
    "character varying": "text",
    varchar: "text",
    character: "text",
    char: "text",
    text: "text",
    citext: "text",

    // JSON Types
    json: "text",
    jsonb: "text",

    // UUID
    uuid: "text",

    // XML
    xml: "xml",

    // Enum
    enum: "text",

    // Network Address Types
    cidr: "text",
    inet: "text",
    macaddr: "text",

    // Geometric Types
    point: undefined,
    line: undefined,
    lseg: undefined,
    box: undefined,
    path: undefined,
    polygon: undefined,
    circle: undefined,

    // Range Types
    int4range: undefined,
    int8range: undefined,
    numrange: undefined,
    tsrange: undefined,
    tstzrange: undefined,
    daterange: undefined,
    int4multirange: undefined,
    int8multirange: undefined,
    nummultirange: undefined,
    tsmultirange: undefined,
    tstzmultirange: undefined,
    datemultirange: undefined,

    // Full Text Search Types
    tsvector: "text",
    tsquery: "text",

    // Spatial Types
    geometry: undefined,
    geography: undefined,

    // Unsupported or Specific Use Cases
    hstore: undefined,
    ltree: undefined,
    cube: undefined,
    bytea: undefined,
    bit: undefined,
    varbit: undefined,
    "bit varying": undefined,
    interval: undefined,
  };

  const supports_postgrest_text_search: PGSupportedColumnType[] = [
    "text",
    "varchar",
    "character varying",
    "citext",
    "tsvector",
  ];

  export function supportsTextSearch(
    type: SupabasePostgRESTOpenApi.PostgRESTOpenAPIDefinitionPropertyFormatType
  ): boolean {
    const isArray = type.endsWith("[]");

    // array is not supproted for fts
    // will get "42883 operator does not exist: text[] @@ tsquery"
    if (isArray) {
      return false;
    }

    return supports_postgrest_text_search.includes(
      type as PGSupportedColumnType
    );
  }
}
