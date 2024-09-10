import { PrivateEditorApi } from "@/lib/private";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { createRouteHandlerXSBClient } from "@/supabase/server";
import { GridaXSupabase } from "@/types";
import type {
  EditorApiResponse,
  XSupabasePrivateApiTypes,
} from "@/types/private/api";
import { DontCastJsonProperties } from "@/types/supabase-ext";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface Context {
  params: {};
}

export async function GET(req: NextRequest, context: Context) {
  const workbench_project_id = Number(
    req.nextUrl.searchParams.get("grida_project_id")
  );

  const cookieStore = cookies();
  const supabase = createRouteHandlerXSBClient(cookieStore);

  const { data: supabase_project, error: rls_err } = await supabase
    .from("supabase_project")
    .select(
      `
        *,
        tables:supabase_table(id, sb_schema_name, sb_table_name)
      `
    )
    .eq("project_id", workbench_project_id)
    .single();

  if (rls_err) {
    console.error("RLS ERR:", rls_err);
    return notFound();
  }

  return NextResponse.json({
    data: supabase_project satisfies DontCastJsonProperties<
      XSupabasePrivateApiTypes.GetSupabaseProjectData,
      "sb_public_schema" | "sb_schema_definitions" | "sb_schema_openapi_docs"
    >,
  });
  //
}

export async function POST(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerXSBClient(cookieStore);

  const data: PrivateEditorApi.XSupabase.CreateProjectConnectionRequest =
    await req.json();
  const { project_id, sb_project_url, sb_anon_key } = data;

  const {
    sb_project_reference_id,
    sb_schema_definitions,
    sb_schema_openapi_docs,
  } = await SupabasePostgRESTOpenApi.fetch_supabase_postgrest_openapi_doc({
    url: sb_project_url,
    anonKey: sb_anon_key,
    schemas: ["public"],
  });

  // 1. create supabase project
  const { data: supabase_project, error: supabase_project_err } = await supabase
    .from("supabase_project")
    .insert({
      project_id: project_id,
      sb_anon_key,
      sb_project_reference_id,
      sb_public_schema: sb_schema_definitions["public"],
      sb_schema_definitions,
      sb_schema_openapi_docs: sb_schema_openapi_docs as {},
      sb_schema_names: ["public"],
      sb_project_url,
    })
    .select()
    .single();

  if (supabase_project_err) {
    console.error(supabase_project_err);
    return NextResponse.error();
  }

  return NextResponse.json({
    data: supabase_project as DontCastJsonProperties<
      GridaXSupabase.SupabaseProject,
      "sb_public_schema" | "sb_schema_definitions" | "sb_schema_openapi_docs"
    >,
  } satisfies EditorApiResponse<GridaXSupabase.SupabaseProject>);
}
