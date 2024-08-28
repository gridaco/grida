import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import {
  createRouteHandlerClient,
  grida_xsupabase_client,
} from "@/lib/supabase/server";
import { GridaXSupabase } from "@/types";
import { XSupabasePrivateApiTypes } from "@/types/private/api";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface Context {
  params: {
    form_id: string;
  };
}

// TODO: safely remove
/*
export async function GET(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: conn_ref, error: conn_ref_error } = await supabase
    .from("connection_supabase")
    .select()
    .eq("form_id", form_id)
    .single();

  if (conn_ref_error) {
    console.error(conn_ref_error);
    return NextResponse.error();
  }

  if (!conn_ref) return notFound();
  if (!conn_ref.main_supabase_table_id) {
    return NextResponse.json(
      { data: null, error: "No table connected" },
      { status: 404 }
    );
  }

  const { data: table } = await grida_xsupabase_client
    .from("supabase_table")
    .select("*")
    .eq("id", conn_ref.main_supabase_table_id)
    .single();

  return NextResponse.json({
    data: table,
    error: null,
  });
}
*/

// FIXME: this will fail since we don't craete connection_supabase on project connection.
// @see https://github.com/gridaco/grida/pull/179
export async function PUT(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const {
    schema_name,
    table_name,
  }: XSupabasePrivateApiTypes.CreateConnectionTableRequestData =
    await req.json();

  const { data: conn_ref, error: conn_ref_error } = await supabase
    .from("connection_supabase")
    .select()
    .eq("form_id", form_id)
    .single();

  if (conn_ref_error) {
    console.error(conn_ref_error);
    return NextResponse.error();
  }

  if (!conn_ref) return notFound();

  const { data: supabase_project } = await grida_xsupabase_client
    .from("supabase_project")
    .select(
      "sb_schema_definitions, sb_schema_openapi_docs, tables:supabase_table(*)"
    )
    .eq("id", conn_ref.supabase_project_id)
    .single();

  assert(supabase_project, "supbase_project not found");

  const table_schema = (
    supabase_project.sb_schema_definitions as {
      [schema: string]: GridaXSupabase.TableSchemaDefinitions;
    }
  )[schema_name][table_name];

  const { methods: sb_postgrest_methods } =
    SupabasePostgRESTOpenApi.parse_supabase_postgrest_table_path(
      (
        supabase_project.sb_schema_openapi_docs as any as {
          [schema: string]: SupabasePostgRESTOpenApi.SupabaseOpenAPIDocument;
        }
      )[schema_name],
      table_name
    );

  const { data: upserted_supabase_table, error } = await grida_xsupabase_client
    .from("supabase_table")
    .upsert(
      {
        supabase_project_id: conn_ref!.supabase_project_id,
        sb_table_name: table_name,
        sb_schema_name: schema_name,
        sb_table_schema: table_schema,
        sb_postgrest_methods,
      },
      {
        onConflict: "supabase_project_id, sb_table_name, sb_schema_name",
      }
    )
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.error();
  }

  // update connection_supabase
  await supabase
    .from("connection_supabase")
    .update({
      main_supabase_table_id: upserted_supabase_table.id,
    })
    .eq("id", conn_ref.id);

  return NextResponse.json({ data: null, error: null }, { status: 200 });
}

// TODO: add once ready on ui
// export async function DELETE(req: NextRequest, context: Context) {
//   const form_id = context.params.form_id;
//   const cookieStore = cookies();
//   const supabase = createRouteHandlerClient(cookieStore);

//   const { count, error } = await supabase
//     .from("connection_supabase")
//     .delete({ count: "exact" })
//     .eq("form_id", form_id);

//   if (error) {
//     console.error(error);
//     return NextResponse.error();
//   }

//   if (count) {
//     return NextResponse.json({ data: null }, { status: 200 });
//   }

//   return NextResponse.error();
// }
