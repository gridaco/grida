import type { Database } from "@app/database";
import type {
  FormBlock,
  FormMethod,
  FormAgentPrefetchData,
} from "@grida/forms";
import type { SupabasePostgRESTOpenApi } from "./lib/supabase-postgrest/parse";
export type {
  Geo,
  FormSubmitErrorCode,
  FormsApiResponse,
  CreateSessionSignedUploadUrlRequest,
  SessionSignedUploadUrlData,
  StoragePublicUrlData,
} from "@grida/forms";

export type PlatformPoweredBy =
  | "api"
  | "grida_forms"
  | "web_client"
  | "simulator";
export type SchemaTableConnectionXSupabaseMainTableJoint =
  Database["grida_forms"]["Tables"]["connection_supabase"]["Row"];
export type FormDocument = Omit<
  Database["grida_forms"]["Tables"]["form_document"]["Row"],
  "start_page" | "background" | "stylesheet" | "method"
> & {
  method: FormMethod;
  blocks: FormBlock[];
  start_page: FormAgentPrefetchData["start_page"];
  background: FormAgentPrefetchData["background"];
  stylesheet: FormAgentPrefetchData["stylesheet"];
};
export namespace GridaXSupabase {
  export type JSONSChema =
    SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema;
  export type SupabaseProject = Omit<
    Database["grida_x_supabase"]["Tables"]["supabase_project"]["Row"],
    "sb_schema_definitions"
  > & {
    sb_schema_definitions: Record<string, Record<string, JSONSChema>>;
  };
  export type SupabaseTable = Omit<
    Database["grida_x_supabase"]["Tables"]["supabase_table"]["Row"],
    "sb_table_schema"
  > & { sb_table_schema: JSONSChema };
  export type XSupabaseMainTableConnectionState =
    SchemaTableConnectionXSupabaseMainTableJoint & {
      supabase_project: SupabaseProject;
      main_supabase_table: SupabaseTable | null;
      tables: SupabaseTable[];
    };
  export namespace Forms {
    export type XSBSearchMetaResult = {
      meta: {
        provider: "x-supabase";
        supabase_project_id: number;
        schema_name: string;
        referenced_table: string;
        referenced_column: string;
      };
    };
  }
}
export namespace Relation {
  export type NonCompositeRelationship = {
    referencing_column: string;
    referenced_table: string;
    referenced_column: string;
  };
  export type Attribute = {
    name: string;
    description?: string;
    type?: "string" | "number" | "integer" | "boolean" | "null" | "array";
    format: string;
    scalar_format: string;
    enum?: string[];
    array: boolean;
    pk: boolean;
    fk: NonCompositeRelationship | false;
    null: boolean;
    default?: string;
  };
  export type TableDefinition = {
    name: string;
    pks: string[];
    fks: NonCompositeRelationship[];
    properties: Record<string, Attribute>;
  };
}
