import type { FormFieldDefinition } from "@/grida-forms-hosted/types";
import { TProperty } from "@/lib/spock";
import type { tokens } from "@grida/tokens";

export namespace FormExpression {
  export function create_field_property_json_ref(
    field_id: string,
    ...access: string[]
  ): tokens.JSONRef<"fields/"> {
    return {
      $ref: `#/fields/${field_id}/${access.join("/")}`,
    };
  }
  export namespace schema {
    export function map_field_to_property(
      field: FormFieldDefinition
    ): TProperty {
      const { type, multiple } = field;
      switch (type) {
        case "range":
        case "number":
          return {
            type: "object",
            properties: {
              value: {
                type: "number",
                description: "value",
              },
            },
          };
        //
        case "color":
        //
        case "search":
        case "select":
        case "radio":
        case "hidden":
          return {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "value",
              },
            },
          };
        case "tel":
        case "text":
        case "email":
        case "textarea":
        case "url":
          return {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "Input value",
              },
            },
          };
        case "switch":
        case "checkbox": {
          return {
            type: "object",
            properties: {
              value: {
                type: "boolean",
                description: "If checked (on) or not",
              },
            },
          };
        }
        case "file":
        case "image":
        case "video":
        case "audio":
          // files: type: array - not supported
          if (multiple) break;
          return {
            type: "object",
            properties: {
              file: {
                description:
                  "References a single file in selected file. when multiple is true, this will always be undefined",
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the selected file",
                  },
                  size: {
                    type: "number",
                    description: "Size of the selected file in bytes",
                  },
                  duration: {
                    type: "number",
                    description:
                      "The duration of the selected audio/video file in seconds. (double precision)",
                  },
                },
              },
            },
          };
      }
      return {
        type: "null",
        description: "unknown type",
      };
    }
  }
}
