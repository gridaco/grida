import { NextRequest, NextResponse } from "next/server";
import type { XSupabasePrivateApiTypes } from "@/types/private/api";
import { createXSBClient } from "@/lib/supabase/server";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import assert from "assert";

type Params = { supabase_project_id: string };

interface Context {
  params: Promise<Params>;
}

export async function POST(req: NextRequest, context: Context) {
  const xsbClient = await createXSBClient();
  const { supabase_project_id: supabase_project_id_param } =
    await context.params;
  const supabase_project_id = Number(supabase_project_id_param);
  assert(
    Number.isFinite(supabase_project_id),
    "Invalid supabase_project_id (expected a numeric route param)"
  );

  const body: XSupabasePrivateApiTypes.AddSchemaNameRequestData =
    await req.json();

  const { data: prev } = await xsbClient
    .from("supabase_project")
    .select(`id, sb_project_url, sb_anon_key, sb_schema_names`)
    .eq("id", supabase_project_id)
    .single();

  assert(prev, "No sb project found");

  const schema_names = Array.from(
    new Set([...prev.sb_schema_names, body.schema_name])
  );

  const { sb_schema_definitions, sb_schema_openapi_docs } =
    await SupabasePostgRESTOpenApi.fetch_supabase_postgrest_openapi_doc({
      url: prev.sb_project_url,
      anonKey: prev.sb_anon_key,
      schemas: schema_names,
    });

  const { data: patch, error: patch_error } = await xsbClient
    .from("supabase_project")
    .update({
      sb_schema_names: Array.from(schema_names),
      sb_public_schema: sb_schema_definitions["public"],
      sb_schema_definitions,
      sb_schema_openapi_docs: sb_schema_openapi_docs as {},
    })
    .eq("id", supabase_project_id)
    .select(`*, tables:supabase_table(*)`)
    .single();

  if (patch_error) {
    console.error(patch_error);
    return NextResponse.error();
  }

  return NextResponse.json({ data: patch });
}
