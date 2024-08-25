import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { createRouteHandlerXSBClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface Context {
  params: {
    supabase_project_id: number;
  };
}

export async function PATCH(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerXSBClient(cookieStore);
  const { supabase_project_id } = context.params;

  const { data: supabase_project, error: rls_err } = await supabase
    .from("supabase_project")
    .select(
      `
        sb_project_url,
        sb_anon_key,
        sb_schema_names,
        tables:supabase_table(id, sb_schema_name, sb_table_name)
      `
    )
    .eq("id", supabase_project_id)
    .single();

  if (rls_err) {
    console.error("RLS ERR:", rls_err);
    return notFound();
  }

  const { sb_schema_definitions } =
    await SupabasePostgRESTOpenApi.fetch_supabase_postgrest_swagger({
      url: supabase_project!.sb_project_url,
      anonKey: supabase_project!.sb_anon_key,
      schemas: supabase_project!.sb_schema_names,
    });

  for (const { id, sb_schema_name, sb_table_name } of supabase_project.tables) {
    const new_schema: {} | undefined =
      sb_schema_definitions[sb_schema_name]?.[sb_table_name];
    const might_be_deleted = !new_schema;
    const { error } = await supabase
      .from("supabase_table")
      .update({
        sb_table_schema: might_be_deleted ? undefined : new_schema,
        // is_deleted: might_be_deleted, // TODO:
      })
      .eq("id", id);
    if (error) {
      console.error(
        'Error updating table schema for table "%s.%s"',
        sb_schema_name,
        sb_table_name
      );
    }
  }

  const { data: patch, error: patch_error } = await supabase
    .from("supabase_project")
    .update({
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
