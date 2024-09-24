import type { FormInputType, SQLPredicateOperator } from "@/types";
import type { PGSupportedColumnType } from "../supabase-postgrest/@types/pg";
import { SupabasePostgRESTOpenApi } from "../supabase-postgrest";

export namespace GridaXSupabaseTypeMap {
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

  export function getPredicateOperators({
    format,
  }: {
    format: SupabasePostgRESTOpenApi.PostgRESTOpenAPIDefinitionPropertyFormatType;
  }): SQLPredicateOperator[] {
    const _get_for_non_array = (
      format: PGSupportedColumnType
    ): SQLPredicateOperator[] => {
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
        case "xml":
        case "inet":
        case "cidr":
        case "macaddr":
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
          return ["eq", "neq", "is", "sl", "sr", "nxl", "nxr", "adj", "ov"];

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
      const baseFormat = format.replace("[]", "") as PGSupportedColumnType;
      // For array types, the operators "cs" (contains) and "cd" (contained by) are typically used
      return [..._get_for_non_array(baseFormat), "cs", "cd"];
    } else {
      return _get_for_non_array(format as PGSupportedColumnType);
    }
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
        relation: {
          referenced_table: string;
          referenced_column: string;
        };
      };

  export type SQLLiteralInputType = SQLLiteralInputConfig["type"];

  export function getSQLLiteralInputConfig({
    fk,
    is_enum,
    enums,
    format,
  }: SupabasePostgRESTOpenApi.PostgRESTColumnMeta):
    | Exclude<SQLLiteralInputConfig, { type: "is" }>
    | undefined {
    if (format?.includes("[]")) {
      return { type: "text" };
    }

    // for fk relation
    if (fk) {
      return {
        type: "search",
        relation: {
          referenced_column: fk.referenced_column,
          referenced_table: fk.referenced_table,
        },
      };
    }

    // for enum type
    if (is_enum) {
      return {
        type: "select",
        options: enums ?? [],
      };
    }

    // others
    const input_type =
      postgrest_column_type_to_literal_input_type[
        format as PGSupportedColumnType
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
            (format?.endsWith("with time zone") || format?.endsWith("tz")) ??
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
}
