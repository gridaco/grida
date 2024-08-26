import {
  createRouteHandlerClient,
  grida_xsupabase_client,
} from "@/lib/supabase/server";
import { XSupabasePrivateApiTypes } from "@/types/private/api";
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
    .select("sb_schema_definitions, tables:supabase_table(*)")
    .eq("id", conn_ref.supabase_project_id)
    .single();

  const table_schema = (supabase_project!.sb_schema_definitions as any)[
    schema_name
  ][table_name];

  const { data: upserted_supabase_table, error } = await grida_xsupabase_client
    .from("supabase_table")
    .upsert(
      {
        supabase_project_id: conn_ref!.supabase_project_id,
        sb_table_name: table_name,
        sb_schema_name: schema_name,
        sb_table_schema: table_schema,
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
