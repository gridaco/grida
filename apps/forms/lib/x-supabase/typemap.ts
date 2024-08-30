import type { FormInputType } from "@/types";

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
}
