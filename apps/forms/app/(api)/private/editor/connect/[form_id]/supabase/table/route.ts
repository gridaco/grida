import {
  createRouteHandlerClient,
  grida_xsupabase_client,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface Context {
  params: {
    form_id: string;
  };
}

interface CreateConnectionTableRequestData {
  table: string;
}

export async function PUT(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const data = (await req.json()) as CreateConnectionTableRequestData;

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
    .select("*, tables:supabase_table(*)")
    .eq("id", conn_ref.supabase_project_id)
    .single();

  const schema = (supabase_project!.sb_public_schema as any)[data.table];

  const { data: upserted_supabase_table, error } = await grida_xsupabase_client
    .from("supabase_table")
    .upsert(
      {
        supabase_project_id: conn_ref!.supabase_project_id,
        sb_table_name: data.table,
        sb_schema_name: "public",
        sb_table_schema: schema,
      },
      {
        onConflict: "supabase_project_id, sb_table_name, sb_schema_name",
      }
    )
    .select()
    .single();

  if (error) return NextResponse.error();

  // update connection_supabase
  await supabase
    .from("connection_supabase")
    .update({
      main_supabase_table_id: upserted_supabase_table.id,
    })
    .eq("id", conn_ref.id);

  return NextResponse.json({ data: null, error: null }, { status: 200 });
}
