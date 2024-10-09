import type { SchemaTableConnectionXSupabaseMainTableJoint } from "./types";
import type {
  PostgrestSingleResponse,
  Provider,
  User,
} from "@supabase/supabase-js";
import type { Bucket } from "@supabase/storage-js";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

export namespace GridaXSupabase {
  export type XSBQueryResult<T extends Record<string, any> = any> =
    PostgrestSingleResponse<GridaXSupabase.XDataRow<T>[]>;

  type XSBSearchMeta<X = {}> = {
    schema_name: string;
    table_name: string;
    table_schema: GridaXSupabase.SupabaseTable["sb_table_schema"] | null;
  } & X;

  export type XSBSearchResult<
    T extends Record<string, any> = any,
    X = {},
  > = XSBQueryResult<T> & { meta: XSBSearchMeta<X> | null };

  export type XSBPostgrestMethod = "get" | "post" | "delete" | "patch";

  export type XDataRow<T extends Record<string, any> = Record<string, any>> = T;

  export type JSONSChema =
    SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema;

  export type TableSchemaDefinitions = {
    [key: string]: JSONSChema;
  };

  export interface SupabaseProject {
    id: number;
    project_id: number;
    sb_anon_key: string;
    sb_project_reference_id: string;
    /**
     * @deprecated use `sb_schema_definitions["public"]` instead
     */
    sb_public_schema: TableSchemaDefinitions;
    sb_schema_definitions: { [schema: string]: TableSchemaDefinitions };
    sb_schema_names: string[];
    sb_project_url: string;
    sb_service_key_id: string | null;
    sb_schema_openapi_docs: {
      [schema: string]: SupabasePostgRESTOpenApi.SupabaseOpenAPIDocument;
    };
  }

  export interface SupabaseTable {
    id: number;
    supabase_project_id: number;
    sb_schema_name: string;
    sb_table_name: string;
    sb_table_schema: JSONSChema;
    sb_postgrest_methods: XSBPostgrestMethod[];
  }

  export type XSupabaseMainTableConnectionState =
    SchemaTableConnectionXSupabaseMainTableJoint & {
      supabase_project: GridaXSupabase.SupabaseProject;
      main_supabase_table: GridaXSupabase.SupabaseTable | null;
      tables: GridaXSupabase.SupabaseTable[];
    };

  export type SupabaseUser = User;

  export type SupabaseAuthProvider = Provider | "email";

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
  } as unknown as SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema; // TODO: this works for now, but lets remove the `as unknown as` when theres a time.

  export type SupabaseUserColumn =
    keyof (typeof SupabaseUserJsonSchema)["properties"];

  export type SupabaseBucket = Bucket;
}
