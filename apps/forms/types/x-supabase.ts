import type { JSONSchemaType } from "ajv";
import type { ConnectionSupabaseJoint } from "./types";
import type { User } from "@supabase/supabase-js";
import type { Bucket } from "@supabase/storage-js";
export namespace GridaSupabase {
  export type XDataRow = Record<string, any> & {
    __storage_fields: Record<
      string,
      {
        signedUrl: string;
        path: string;
      } | null
    >;
  };

  export type JSONSChema = JSONSchemaType<Record<string, any>> & {
    properties: {
      [key: string]: JSONSchemaType<any>;
    };
  };

  export type SchemaDefinitions = {
    [key: string]: JSONSChema;
  };

  export interface SupabaseProject {
    id: number;
    project_id: number;
    sb_anon_key: string;
    sb_project_reference_id: string;
    sb_public_schema: SchemaDefinitions | null;
    sb_project_url: string;
    sb_service_key_id: string | null;
  }

  export interface SupabaseTable {
    id: number;
    supabase_project_id: number;
    sb_schema_name: "public" | (string | {});
    sb_table_name: string;
    sb_table_schema: JSONSChema;
  }

  export type SupabaseConnectionState = ConnectionSupabaseJoint & {
    supabase_project: GridaSupabase.SupabaseProject;
    main_supabase_table: GridaSupabase.SupabaseTable | null;
    tables: GridaSupabase.SupabaseTable[];
  };

  export type SupabaseUser = User;

  // TODO: typings are incomplete - type, format, etc
  export const SupabaseUserJsonSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "User",
    type: "object",
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      app_metadata: {
        type: "object",
        format: "jsonb",
      },
      user_metadata: {
        type: "object",
        format: "text",
      },
      aud: {
        type: "string",
        format: "text",
      },
      confirmation_sent_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      recovery_sent_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      email_change_sent_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      new_email: {
        type: "string",
        format: "text",
      },
      new_phone: {
        type: "string",
        format: "text",
      },
      invited_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      action_link: {
        type: "string",
        format: "text",
      },
      email: {
        type: "string",
        format: "text",
      },
      phone: {
        type: "string",
        format: "text",
      },
      created_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      confirmed_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      email_confirmed_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      phone_confirmed_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      last_sign_in_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      role: {
        type: "string",
        format: "text",
      },
      updated_at: {
        type: "string",
        format: "timestamp with time zone",
      },
      identities: {
        type: "array",
        items: {
          type: "object",
        },
        format: "jsonb",
      },
      is_anonymous: {
        type: "boolean",
        format: "boolean",
      },
      factors: {
        type: "array",
        items: {
          type: "object",
        },
        format: "jsonb",
      },
    },
    required: [
      "id",
      "app_metadata",
      "user_metadata",
      "aud",
      "created_at",
      "updated_at",
    ],
  };

  export type SupabaseUserColumn =
    keyof (typeof SupabaseUserJsonSchema)["properties"];

  export type SupabaseBucket = Bucket;
}
