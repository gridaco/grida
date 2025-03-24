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
  export const TYPE = "grida.platform.customer";

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
