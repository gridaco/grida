import type { Database } from "@app/database";
import type {
  FormBlock,
  FormMethod,
  FormAgentPrefetchData,
} from "@grida/forms";
import type { SupabasePostgRESTOpenApi } from "@grida/postgrest";
export type {
  Geo,
  FormSubmitErrorCode,
  FormsApiResponse,
  CreateSessionSignedUploadUrlRequest,
  SessionSignedUploadUrlData,
  StoragePublicUrlData,
} from "@grida/forms";

export type { PlatformPoweredBy } from "@grida/forms";
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
}
export namespace Relation {
  export type NonCompositeRelationship =
    SupabasePostgRESTOpenApi.NonCompositeRelationship;
  export type Attribute = SupabasePostgRESTOpenApi.Attribute;
  export type TableDefinition = SupabasePostgRESTOpenApi.TableDefinition;
}
