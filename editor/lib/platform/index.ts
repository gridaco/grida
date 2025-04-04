import type { Data } from "@/lib/data";
import type { DataFormat } from "@/scaffolds/data-format";
import type { Authentication } from "../auth";
import { unflatten } from "flat";
import Papa from "papaparse";

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
  export const parser_config: Papa.ParseConfig = {
    header: true,
    skipEmptyLines: true,
    comments: "#",
    transform: (value: string, field: string) => {
      if (value === "") return undefined;
      return value;
    },
  };

  export function parse(txt: string) {
    return Papa.parse<Record<string, string | undefined>>(
      txt,
      Platform.CSV.parser_config
    );
  }

  export interface CSVValidationError {
    details: string;
    hint: string;
    code: string;
  }

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
  export function validate_row<T = unknown>(
    row: Record<string, string | undefined>,
    model: Record<
      string,
      {
        type: "string" | "number" | "boolean" | "object" | "array";
        format?: string;
        required: boolean;
        items?: {
          type: "string" | "number" | "boolean";
          format?: string;
        };
      }
    >,
    checkformat: (value: string, format: string) => boolean = () => true
  ): { data: T; error: null } | { data: null; error: CSVValidationError } {
    const obj = unflatten(row) as Record<string, unknown>;

    // Reject if any top-level key is not defined in the model.
    for (const key in obj) {
      if (!(key in model))
        return {
          error: {
            code: "INVALID_KEY",
            details: `Key "${key}" is not defined in the model.`,
            hint: "Remove the invalid key",
          },
          data: null,
        };
    }

    // Ensure required fields are present and that values with formats are valid.
    for (const key in model) {
      const spec = model[key];
      const value = obj[key];

      // required field check
      if (spec.required && value === undefined)
        return {
          error: {
            code: "MISSING_REQUIRED_FIELD",
            details: `Missing required field: ${key}`,
            hint: "Check the CSV file for missing required fields",
          },
          data: null,
        };

      // array check
      if (spec.type === "array") {
        if (value === undefined) {
          obj[key] = undefined;
        } else if (typeof value === "string") {
          const arrayValues = value
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0);
          if (
            spec.format &&
            !(spec.items?.format
              ? arrayValues.every((v) => checkformat(v, spec.items!.format!))
              : true)
          ) {
            return {
              error: {
                code: "INVALID_ARRAY_VALUE",
                details: `Invalid array value for field: ${key}`,
                hint: "Check the CSV file for invalid array values",
              },
              data: null,
            };
          }

          obj[key] = arrayValues;
        } else {
          return {
            error: {
              code: "INVALID_ARRAY_TYPE",
              details: `Invalid array type for field: ${key}`,
              hint: "Check the CSV file for invalid array types",
            },
            data: null,
          };
        }
      }

      // primitive type check
      if (value !== undefined && spec.format && typeof value === "string") {
        if (!checkformat(value, spec.format))
          return {
            error: {
              code: "INVALID_FORMAT",
              details: `Invalid format for field: ${key}`,
              hint: "Check the CSV file for invalid formats",
            },
            data: null,
          };
      }
    }

    return { data: obj as T, error: null };
  }
}

export namespace Platform.Tag {
  export type TagNameAndColor = {
    name: string;
    color: string;
  };

  export type TagNameAndColorAndDescription = {
    name: string;
    color: string;
    description: string | null;
  };

  export type Tag = {
    id: number;
    project_id: number;

    /**
     * the name (label) of the tag
     */
    name: string;

    /**
     * optional description for this tag
     */
    description: string | null;

    /**
     * hex color code
     */
    color: string;
    created_at: string;
  };

  export type TagWithUsageCount = Tag & {
    usage_count: number;
  };
}

export namespace Platform.Customer {
  export const TYPE = "grida.platform.customer";

  /**
   * text search, filtering
   */
  export const TABLE_SEARCH_TEXT = "search_text";

  /**
   * websearch
   */
  export const TABLE_SEARCH_TSV = "search_tsv";

  export const TABLE: Data.Relation.TableDefinition = {
    name: "customer",
    pks: ["uid"],
    fks: [
      {
        referencing_column: "visitor_id",
        referenced_table: "visitor",
        referenced_column: "id",
      },
      {
        referencing_column: "project_id",
        referenced_table: "project",
        referenced_column: "id",
      },
    ],
    properties: {
      created_at: {
        name: "created_at",
        description: "creation timestamp",
        type: "string",
        format: "timestamptz",
        scalar_format: "timestamptz",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: false,
        default: "now()",
      },
      uid: {
        name: "uid",
        description: "customer uid",
        type: "string",
        format: "uuid",
        scalar_format: "uuid",
        enum: undefined,
        array: false,
        pk: true,
        fk: false,
        null: false,
        default: "gen_random_uuid()",
      },
      email: {
        name: "email",
        description: "customer email",
        type: "string",
        format: "citext",
        scalar_format: "citext",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: true,
        default: undefined,
      },
      last_seen_at: {
        name: "last_seen_at",
        description: "last seen timestamp",
        type: "string",
        format: "timestamptz",
        scalar_format: "timestamptz",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: false,
        default: "now()",
      },
      uuid: {
        name: "uuid",
        description: "secondary uuid",
        type: "string",
        format: "uuid",
        scalar_format: "uuid",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: true,
        default: undefined,
      },
      phone: {
        name: "phone",
        description: "customer phone",
        type: "string",
        format: "citext",
        scalar_format: "citext",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: true,
        default: undefined,
      },
      is_email_verified: {
        name: "is_email_verified",
        description: "email verification status",
        type: "boolean",
        format: "boolean",
        scalar_format: "boolean",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: false,
        default: "false",
      },
      is_phone_verified: {
        name: "is_phone_verified",
        description: "phone verification status",
        type: "boolean",
        format: "boolean",
        scalar_format: "boolean",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: false,
        default: "false",
      },
      description: {
        name: "description",
        description: "customer description",
        type: "string",
        format: "text",
        scalar_format: "text",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: true,
        default: undefined,
      },
      metadata: {
        name: "metadata",
        description: "metadata",
        type: undefined,
        format: "jsonb",
        scalar_format: "jsonb",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: true,
        default: undefined,
      },
      name: {
        name: "name",
        description: "customer name",
        type: "string",
        format: "text",
        scalar_format: "text",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: true,
        default: undefined,
      },
      is_marketing_email_subscribed: {
        name: "is_marketing_email_subscribed",
        description: "email marketing subscription",
        type: "boolean",
        format: "boolean",
        scalar_format: "boolean",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: false,
        default: "false",
      },
      is_marketing_sms_subscribed: {
        name: "is_marketing_sms_subscribed",
        description: "sms marketing subscription",
        type: "boolean",
        format: "boolean",
        scalar_format: "boolean",
        enum: undefined,
        array: false,
        pk: false,
        fk: false,
        null: false,
        default: "false",
      },
    },
  };

  export interface Customer {
    project_id: number;
    uid: string;
    created_at: string;
    last_seen_at: string;
    name: string | null;
    email: string | null;
    email_provisional: string[];
    phone: string | null;
    phone_provisional: string[];
    description: string | null;
    uuid: string | null;
    metadata: unknown | null;
    is_marketing_email_subscribed: boolean;
    is_marketing_sms_subscribed: boolean;
  }

  export interface CustomerInsertion {
    project_id: number;
    uuid?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    description?: string | null;
    metadata?: unknown | null;
  }

  export interface CustomerWithTags extends Customer {
    tags: string[];
  }

  export interface CustomerInsertionWithTags extends CustomerInsertion {
    tags: string[];
  }

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
    tags: {
      type: "array",
      required: true,
    },
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
    tags: { ...properties.tags, required: false },
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

export namespace Platform.CustomerAuthPolicy {
  export interface CustomerAuthPolicy {
    id: string;
    created_at: string;
    project_id: number;
    challenges: Authentication.Challenge[];
    description: string | null;
    name: string;
    enabled: boolean;
    scopes: string[];
  }
}

export namespace Platform.WEST {
  export interface ImportParticipantsRequestBody {
    role: "host";
    customer_ids: string[];
  }

  export type Campaign = {
    id: string;
    type: "referral";
    public: Record<string, string> | unknown;
    created_at: string;
    description: string | null;
    enabled: boolean;
    is_participant_name_exposed_to_public_dangerously: boolean;
    max_supply_init_for_new_mint_token: number | null;
    name: string;
    project_id: number;
    scheduling_close_at: string | null;
    scheduling_open_at: string | null;
    scheduling_tz: string | null;
  };

  export type CampaignPublic = {
    id: string;
    type: "referral";
    public: Record<string, string> | unknown;
    created_at: string;
    enabled: boolean;
    name: string;
    scheduling_close_at: string | null;
    scheduling_open_at: string | null;
    scheduling_tz: string | null;
  };

  export type TokenEvent = {
    time: string;
    name: string;
    token_id: string;
    data: Record<string, string>;
  };

  export type Participant = {
    id: string;
    series_id: string;
    customer_id: string;
    created_at: string;
    metadata: Record<string, string> | unknown;
  };

  export type ParticipantCustomer = Participant & {
    name: string | null;
    email: string | null;
    phone: string | null;
  };

  export type ParticipantPublic = {
    id: string;
    series_id: string;
    role: "host" | "participant";
    name: string | null;
  };

  //
  export type Token<
    P extends unknown | Record<string, unknown> | null = unknown,
  > = {
    id: string;
    series_id: string;
    owner_id: string;
    code: string;
    parent_id: string;
    public: P;
    created_at: string;
    token_type: "mintable" | "redeemable";
    max_supply: number | null;
    count: number;
    is_claimed: boolean;
    is_burned: boolean;
  };

  export type TokenPublicRead = {
    token: Token & { owner: ParticipantPublic };
    campaign: CampaignPublic;
    parent: {
      owner: ParticipantPublic;
    } | null;
    children: (Token & { owner: ParticipantPublic })[];
  };

  export class WestClient<
    P extends unknown | Record<string, unknown> | null = unknown,
  > {
    constructor(readonly series_id: string) {}

    read(code: string): Promise<{
      data: TokenPublicRead;
    }> {
      return fetch(`/west/t/${code}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-grida-west-campaign-id": this.series_id,
        },
      }).then((res) => res.json());
    }

    mint(code: string, secret?: string): Promise<{ data: Token<P> }> {
      return fetch(`/west/t/${code}/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-grida-west-campaign-id": this.series_id,
          "x-grida-west-token-secret": secret ?? "",
        },
      }).then((res) => res.json());
    }

    claim(code: string, owner_id: string) {
      return fetch(`/west/t/${code}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-grida-west-campaign-id": this.series_id,
          "x-grida-customer-id": owner_id,
        },
      }).then((res) => {
        return res.ok;
      });
    }

    redeem(code: string): Promise<boolean> {
      return fetch(`/west/t/${code}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then((res) => {
        return res.ok;
      });
    }

    track(code: string, name: string, data?: Record<string, string>) {
      fetch(`/west/t/${code}/track`, {
        method: "POST",
        body: JSON.stringify({
          name: name,
          data,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-grida-west-campaign-id": this.series_id,
        },
      });
      //
    }
  }
}
