import type { Data } from "@/lib/data";
import type { DataFormat } from "@/scaffolds/data-format";
import type { Authentication } from "../auth";
import { unflatten } from "flat";
import Papa from "papaparse";

export namespace Platform {
  export const headers = {
    // grida.customer
    "x-grida-customer-id": "x-grida-customer-id",
    // grida.west
    "x-grida-west-campaign-id": "x-grida-west-campaign-id",
    "x-grida-west-token-code": "x-grida-west-token-code",
    "x-grida-west-invitation-id": "x-grida-west-invitation-id",
    // grida.form
    "x-gf-geo-latitude": "x-gf-geo-latitude",
    "x-gf-geo-longitude": "x-gf-geo-longitude",
    "x-gf-geo-city": "x-gf-geo-city",
    "x-gf-geo-region": "x-gf-geo-region",
    "x-gf-geo-country": "x-gf-geo-country",
    "x-gf-simulator": "x-gf-simulator",
  } as const;
}

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
      tags: {
        name: "tags",
        description: "customer tags",
        type: "array",
        format: "text[]",
        scalar_format: "text",
        enum: undefined,
        array: true,
        pk: false,
        fk: false,
        null: false,
        default: undefined,
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

export namespace Platform.WEST.Referral {
  export const TEST_CODE_REFERRER = "test_referrer";
  export const TEST_CODE_INVITATION = "test_invitation";

  export type TokenRole = "referrer" | "invitation";

  export interface ImportParticipantsRequestBody {
    role: "referrer";
    customer_ids: string[];
  }

  export type Campaign = {
    id: string;
    project_id: number;
    title: string;
    description: string | null;
    enabled: boolean;
    created_at: string;
    layout_id: string | null;
    is_invitee_profile_exposed_to_public_dangerously: boolean;
    is_referrer_profile_exposed_to_public_dangerously: boolean;
    max_invitations_per_referrer: number | null;
    scheduling_close_at: string | null;
    scheduling_open_at: string | null;
    scheduling_tz: string | null;
    public: Record<string, string> | unknown;
  };

  export type CampaignPublic = {
    id: string;
    enabled: boolean;
    title: string;
    description: string | null;
    reward_currency: string;
    max_invitations_per_referrer: number | null;
    layout_id: string | null;
    scheduling_close_at: string | null;
    scheduling_open_at: string | null;
    scheduling_tz: string | null;
    public: Record<string, string> | unknown;
    www_name: string | null;
    www_route_path: string | null;
  };

  export type TokenEvent = {
    time: string;
    name: string;
    token_id: string;
    data: Record<string, string>;
  };

  export type Referrer = {
    id: string;
    project_id: number;
    campaign_id: string;
    code: string;
    customer_id: string;
    created_at: string;
    metadata: Record<string, string> | unknown;
    invitation_count: number;
  };

  export type Invitation = {
    campaign_id: string;
    code: string;
    created_at: string;
    customer_id: string | null;
    id: string;
    is_claimed: boolean;
    metadata: Record<string, string> | unknown;
    referrer_id: string;
  };

  export type Customer = {
    uid: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  };

  export type ReferrerPublicRead = {
    type: "referrer";
    id: string;
    code: string | null;
    referrer_name: string | null;
    campaign: CampaignPublic;
    invitation_count: number;
    invitations: {
      id: string;
      campaign_id: string;
      is_claimed: boolean;
      invitee_name: string | null;
      created_at: string;
      referrer_id: string;
    }[];
  };

  export type InvitationPublicRead = {
    type: "invitation";
    id: string;
    code: string;
    referrer_id: string;
    is_claimed: boolean;
    referrer_name: string | null;
    campaign: CampaignPublic;
    created_at: string;
  };

  export type SharableContext = {
    referrer_name: string;
    invitation_code: string;
    url: string;
  };

  export class WestReferralClient {
    readonly BASE_URL: string;
    constructor(
      readonly campaign_id: string,
      config?: {
        base_url: string;
      }
    ) {
      this.BASE_URL = config?.base_url ?? "https://grida.co/v1/west";
    }

    read(code: string): Promise<{
      data: ReferrerPublicRead | InvitationPublicRead;
    }> {
      return fetch(`${this.BASE_URL}/t`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          [Platform.headers["x-grida-west-campaign-id"]]: this.campaign_id,
          [Platform.headers["x-grida-west-token-code"]]: code,
        },
      }).then((res) => res.json());
    }

    invite(code: string): Promise<{
      data: {
        code: string;
        sharable: SharableContext;
      };
    }> {
      return fetch(`${this.BASE_URL}/t/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [Platform.headers["x-grida-west-campaign-id"]]: this.campaign_id,
          [Platform.headers["x-grida-west-token-code"]]: code,
        },
      }).then((res) => res.json());
    }

    refresh(
      code: string,
      invitation_id: string
    ): Promise<{
      data: {
        code: string;
        sharable: SharableContext;
      };
    }> {
      return fetch(`${this.BASE_URL}/t/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [Platform.headers["x-grida-west-campaign-id"]]: this.campaign_id,
          [Platform.headers["x-grida-west-token-code"]]: code,
          [Platform.headers["x-grida-west-invitation-id"]]: invitation_id,
        },
      }).then((res) => res.json());
    }

    async claim(
      code: string,
      owner_id: string
    ): Promise<
      { ok: true } | { ok: false; error?: { message?: string; code?: string } }
    > {
      const res = await fetch(`${this.BASE_URL}/t/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [Platform.headers["x-grida-west-campaign-id"]]: this.campaign_id,
          [Platform.headers["x-grida-customer-id"]]: owner_id,
          [Platform.headers["x-grida-west-token-code"]]: code,
        },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true };
      return { ok: false, error: body?.error };
    }

    track(code: string, name: string, data?: Record<string, string>) {
      fetch(`${this.BASE_URL}/t/track`, {
        method: "POST",
        body: JSON.stringify({
          name: name,
          data,
        }),
        headers: {
          "Content-Type": "application/json",
          [Platform.headers["x-grida-west-campaign-id"]]: this.campaign_id,
          [Platform.headers["x-grida-west-token-code"]]: code,
        },
      });
      //
    }
  }
}

export namespace Platform.WEST.Referral.Wizard {
  export type RewardType = "double-sided" | "referrer-only" | "invitee-only";
  export type RewardCurrencyType =
    | "virtual-currency"
    | "draw-ticket"
    | "discount"
    | "custom";

  export type CampaignData = {
    title: string;
    description: string;
    reward_strategy_type: RewardType;
    reward_currency_type: RewardCurrencyType;
    reward_currency: string;
    max_invitations_per_referrer: number | null;
    referrer_milestone_rewards: Array<{
      threshold: number;
      description: string;
      value: number;
    }>;
    invitee_onboarding_reward: {
      description: string;
      value: number;
    };
    __prefers_builtin_platform: boolean;
    __prefers_offline_manual: boolean;
    challenges: Array<{
      index: number;
      trigger_name: string;
      description: string;
      depends_on: string | null;
    }>;
    triggers: Array<{
      name: string;
      description: string;
    }>;
    conversion_currency: string;
    conversion_value: number | null;
    is_referrer_profile_exposed_to_public_dangerously: boolean;
    is_invitee_profile_exposed_to_public_dangerously: boolean;
    enabled: boolean;
    scheduling: {
      __prefers_start_now: boolean;
      scheduling_open_at: string | null;
      scheduling_close_at: string | null;
      scheduling_tz: string | null;
    };
  };
}
