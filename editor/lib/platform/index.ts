import type { DataFormat } from "@/scaffolds/data-format";
import { unflatten } from "flat";

export namespace Platform {}

/**
 * the supported csv features and implementations
 */
export namespace Platform.CSV {
  /**
   * default csv parser configuration
   *
   * - header: true
   * - skipEmptyLines: true
   * - comments: "#"
   * - transform:
   *   - if value is empty "", return undefined
   *
   */
  export const parser_config = {
    header: true,
    skipEmptyLines: true,
    comments: "#",
    transform: (value: string, field: string) => {
      if (value === "") return undefined;
      return value;
    },
  };

  /**
   * Validates a CSV row against the provided model specification.
   *
   * The function unflattens the row and checks that all top-level keys in the unflattened object
   * are defined in the model. It also ensures that all required fields are present and,
   * if a format is specified, that the value conforms to that format using the provided checkformat function.
   *
   * @param row - A record representing a CSV row with flattened keys.
   * @param model - The model specification with allowed keys, types, formats, and required flags.
   * @param checkformat - A function to validate a field against a specified format. Defaults to a function that always returns true.
   * @returns `true` if the row is valid according to the model; otherwise, `false`.
   */
  export function validate_row(
    row: Record<string, string>,
    model: Record<
      string,
      {
        type: "string" | "number" | "boolean" | "object";
        format?: string;
        required: boolean;
      }
    >,
    checkformat: (value: string, format: string) => boolean = () => true
  ): boolean {
    const obj = unflatten(row) as Record<string, unknown>;

    // Reject if any top-level key is not defined in the model.
    for (const key in obj) {
      if (!(key in model)) return false;
    }

    // Ensure required fields are present and that values with formats are valid.
    for (const key in model) {
      if (model[key].required && obj[key] === undefined) return false;
      if (
        obj[key] !== undefined &&
        model[key].format &&
        typeof obj[key] === "string"
      ) {
        if (!checkformat(obj[key], model[key].format)) return false;
      }
    }
    return true;
  }
}

export namespace Platform.Customer {
  export interface Property {
    type: "string" | "number" | "integer" | "boolean" | "array" | "object";
    format?: DataFormat.Format;
    required: boolean;
    default?: string | number | boolean | null;
  }

  /**
   * well known customer properties
   */
  export const properties = {
    uid: {
      type: "string",
      format: "uuid",
      required: true,
    } satisfies Property,
    uuid: {
      type: "string",
      format: "uuid",
      required: false,
    } satisfies Property,
    email: {
      type: "string",
      format: "email",
      required: false,
    } satisfies Property,
    name: {
      type: "string",
      format: "text",
      required: false,
    } satisfies Property,
    phone: {
      type: "string",
      format: "phone",
      required: false,
    } satisfies Property,
    description: {
      type: "string",
      format: "text",
      required: false,
    } satisfies Property,
    metadata: {
      type: "object",
      required: false,
    } satisfies Property,
    created_at: {
      type: "string",
      format: "timestamptz",
      required: true,
    } satisfies Property,
    last_seen_at: {
      type: "string",
      format: "timestamptz",
      required: false,
    } satisfies Property,
  } as const;

  /**
   * the insertion model allowed by the platform
   */
  export const insert = {
    uuid: properties.uuid,
    name: properties.name,
    email: properties.email,
    phone: properties.phone,
    description: properties.description,
    metadata: properties.metadata,
  } as const;

  /**
   * the update model allowed by the platform
   */
  export const update = {
    uuid: {
      type: "string",
      format: "uuid",
      required: true,
    },
    name: properties.name,
    email: properties.email,
    phone: properties.phone,
    description: properties.description,
    metadata: properties.metadata,
  } as const;

  /**
   * properties that can be used as kba challenge
   */
  export const challenges = {
    name: properties.name,
    email: properties.email,
    phone: properties.phone,
  } as const;
}
