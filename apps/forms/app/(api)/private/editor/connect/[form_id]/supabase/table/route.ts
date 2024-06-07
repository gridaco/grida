import { createRouteHandlerClient } from "@/lib/supabase/server";
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

  const schema = (conn_ref.sb_public_schema as any)[data.table];

  const { error } = await supabase.from("connection_supabase_table").upsert(
    {
      supabase_connection_id: conn_ref.id,
      sb_table_name: data.table,
      schema_name: "public",
      sb_table_schema: schema,
    },
    {
      onConflict: "supabase_connection_id",
    }
  );

  if (error) return NextResponse.error();

  return NextResponse.json({ data: null, error: null }, { status: 200 });
}
