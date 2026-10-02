import { SupabasePostgRESTOpenApi as PostgREST } from "@grida/postgrest";

/** Shared schema interpretation plus editor-owned connection discovery. */
export namespace SupabasePostgRESTOpenApi {
  export type NonCompositeRelationship = PostgREST.NonCompositeRelationship;
  export type Attribute = PostgREST.Attribute;
  export type TableDefinition = PostgREST.TableDefinition;
  export type PostgRESTOpenAPIDefinitionPropertyFormatType =
    PostgREST.PostgRESTOpenAPIDefinitionPropertyFormatType;
  export type SupabaseOpenAPIDefinitionProperty =
    PostgREST.SupabaseOpenAPIDefinitionProperty;
  export type SupabaseOpenAPIDefinitionJSONSchema =
    PostgREST.SupabaseOpenAPIDefinitionJSONSchema;
  export type SupabaseOpenAPIDocument = PostgREST.SupabaseOpenAPIDocument;
  export type SupabasePublicSchema = PostgREST.SupabasePublicSchema;
  export type PostgrestPathMethod = PostgREST.PostgrestPathMethod;
  export type PostgRESTColumnRelationship =
    PostgREST.PostgRESTColumnRelationship;
  export type PostgRESTColumnMeta = PostgREST.PostgRESTColumnMeta;

  export const parse_supabase_postgrest_table_path =
    PostgREST.parse_supabase_postgrest_table_path;
  export const table_is_get_only = PostgREST.table_is_get_only;
  export const table_methods_is_get_only = PostgREST.table_methods_is_get_only;
  export const parse_postgrest_property_meta =
    PostgREST.parse_postgrest_property_meta;
  export const parse_supabase_postgrest_schema_definition =
    PostgREST.parse_supabase_postgrest_schema_definition;
  export const parse_supabase_postgrest_property_description =
    PostgREST.parse_supabase_postgrest_property_description;
  export const parse_pks = PostgREST.parse_pks;

  export function build_supabase_rest_url(url: string) {
    return `${url}/rest/v1/`;
  }

  export function build_supabase_openapi_url(url: string, apiKey: string) {
    return `${url}/rest/v1/?apikey=${apiKey}`;
  }

  export async function fetch_supabase_postgrest_openapi_doc({
    url,
    anonKey,
    schemas = ["public"],
  }: {
    url: string;
    anonKey: string;
    schemas?: string[];
  }): Promise<{
    sb_anon_key: string;
    sb_project_reference_id: string;
    sb_schema_names: string[];
    sb_schema_openapi_docs: { [schema: string]: SupabaseOpenAPIDocument };
    sb_schema_definitions: {
      [schema: string]: { [key: string]: SupabaseOpenAPIDefinitionJSONSchema };
    };
    sb_project_url: string;
  }> {
    const u = new URL(url);
    const projectref = u.hostname.split(".")[0];
    const route = build_supabase_openapi_url(url, anonKey);

    const schema_definitions: {
      [schema: string]: SupabaseOpenAPIDocument["definitions"];
    } = {};
    const schema_apidocs: { [schema: string]: SupabaseOpenAPIDocument } = {};

    // can be optimized
    for (const schema of schemas) {
      const apidoc = await fetch_swagger(route, schema);
      // validate
      if (!apidoc || !("definitions" in apidoc)) {
        throw new Error("Invalid OpenAPI document");
      }
      schema_apidocs[schema] = apidoc;
      schema_definitions[schema] = apidoc.definitions;
    }

    return {
      sb_anon_key: anonKey,
      sb_project_reference_id: projectref,
      sb_schema_openapi_docs: schema_apidocs,
      sb_schema_definitions: schema_definitions,
      sb_schema_names: schemas,
      sb_project_url: url,
    };
  }

  async function fetch_swagger(url: string, schema = "public") {
    const res = await fetch(url, {
      headers: {
        // https://postgrest.org/en/stable/references/api/schemas.html
        "Accept-Profile": schema,
      },
    });
    const apidoc: SupabaseOpenAPIDocument = await res.json();
    if (!res.ok || !apidoc) {
      return undefined;
    }

    return apidoc;
  }
}
