import { NextRequest, NextResponse } from "next/server";
import type { XSupabasePrivateApiTypes } from "@/types/private/api";
import { cookies } from "next/headers";
import {
  createRouteHandlerClient,
  grida_xsupabase_client,
} from "@/lib/supabase/server";
import assert from "assert";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

interface Context {
  params: {
    form_id: string;
  };
}

export async function POST(req: NextRequest, context: Context) {
  //
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const body: XSupabasePrivateApiTypes.AddSchemaNameRequestData =
    await req.json();

  const { data: conn } = await supabase
    .from("connection_supabase")
    .select(`*`)
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const { supabase_project_id } = conn;

  //
  const { data: prev } = await grida_xsupabase_client
    .from("supabase_project")
    .select(`id, sb_project_url, sb_anon_key, sb_schema_names`)
    .eq("id", supabase_project_id)
    .single();

  assert(prev, "No sb project found");

  const schema_names = Array.from(
    new Set([...prev.sb_schema_names, body.schema_name])
  );

  const { sb_schema_definitions } =
    await SupabasePostgRESTOpenApi.fetch_supabase_postgrest_swagger({
      url: prev.sb_project_url,
      anonKey: prev.sb_anon_key,
      schemas: schema_names,
    });

  const { data: patch, error: patch_error } = await grida_xsupabase_client
    .from("supabase_project")
    .update({
      sb_schema_names: Array.from(schema_names),
      sb_public_schema: sb_schema_definitions["public"],
      sb_schema_definitions,
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
