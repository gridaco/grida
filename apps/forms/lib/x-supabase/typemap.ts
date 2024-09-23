import type { FormInputType, SQLPredicateOperator } from "@/types";
import type { PGSupportedColumnType } from "../supabase-postgrest/@types/pg";

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
    format: PGSupportedColumnType | `${PGSupportedColumnType}[]`;
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

  export type SQLLiteralInputType =
    | { type: "text" }
    | { type: "boolean" }
    | { type: "json" }
    | { type: "xml" }
    | { type: "number" }
    | { type: "is"; accepts_boolean: boolean }
    | { type: "time" }
    | { type: "datetime-local" }
    | { type: "date" };
  // | {
  //     type: "search";
  //     relation?: {
  //       table: string;
  //       column: string;
  //     };
  //   };

  export function getLiteralInputType({
    format,
  }: {
    format?: PGSupportedColumnType | `${PGSupportedColumnType}[]`;
  }): SQLLiteralInputType["type"] | undefined {
    if (format?.includes("[]")) {
      return "text";
    }
    switch (format as PGSupportedColumnType) {
      // Number Types
      case "bigint":
      case "integer":
      case "int":
      case "int2":
      case "int4":
      case "int8":
      case "smallint":
      case "decimal":
      case "numeric":
      case "real":
      case "float":
      case "float4":
      case "float8":
      case "double precision":
      case "money":
        return "number";

      // Boolean Types
      case "bool":
      case "boolean":
        return "boolean";

      // Date/Time Types
      case "date":
        return "date";
      case "timestamp":
      case "timestamp without time zone":
      case "timestamp with time zone":
      case "timestamptz":
        return "datetime-local";
      case "time":
      case "time without time zone":
      case "time with time zone":
      case "timetz":
        return "time";

      // Text Types
      case "character varying":
      case "varchar":
      case "character":
      case "char":
      case "text":
      case "citext":
        return "text";

      // JSON Types
      case "json":
      case "jsonb":
        return "text";
      // TODO:

      // UUID
      case "uuid":
        return "text"; // Can use specialized UUID input or regex validation

      // XML
      case "xml":
        return "xml"; // For multiline XML input

      // Enum (may require additional processing for options)
      case "enum":
        return "text";
      // TODO:
      // return "select"; // Enum options could be handled as select inputs

      // Network Address Types
      case "cidr":
      case "inet":
      case "macaddr":
        return "text"; // Custom validation can be added

      // Geometric Types (Custom or unsupported)
      case "point":
      case "line":
      case "lseg":
      case "box":
      case "path":
      case "polygon":
      case "circle":
        return undefined; // Geometric data requires custom handling

      // Range Types (Unsupported)
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
        return undefined; // Ranges require custom components

      // Full Text Search Types
      case "tsvector":
      case "tsquery":
        return "text"; // Can use text input for now

      // Spatial Types (PostGIS or custom handling)
      case "geometry":
      case "geography":
        return undefined; // Requires specialized handling

      // Unsupported or Specific Use Cases
      case "hstore":
      case "ltree":
      case "cube":
        return undefined; // Requires custom handling for key-value data or hierarchical data

      case "bytea":
        return undefined;
      default:
        return undefined; // Not supported or requires custom handling
    }
  }
}
