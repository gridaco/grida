import type { JSONSchemaType } from "ajv";

export namespace GridaSupabase {
  export interface SupabaseProject {
    id: number;
    project_id: number;
    sb_anon_key: string;
    sb_project_reference_id: string;
    sb_public_schema:
      | { [key: string]: JSONSchemaType<Record<string, any>> }
      | null
      | any;
    sb_project_url: string;
    sb_service_key_id: string | null;
  }

  export interface SupabaseTable {
    id: number;
    supabase_project_id: number;
    sb_schema_name: "public" | (string | {});
    sb_table_name: string;
    sb_table_schema: JSONSchemaType<Record<string, any>>;
  }
}
